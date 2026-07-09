import { SUPABASE_CONFIG } from "./supabase-config.js";

const STORAGE_KEY = "moje-dni.entries.v1";
const SUPABASE_CDN_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

const elements = {
  date: document.querySelector("#entryDate"),
  title: document.querySelector("#entryTitle"),
  mood: document.querySelector("#entryMood"),
  content: document.querySelector("#entryContent"),
  photoInput: document.querySelector("#photoInput"),
  photoGrid: document.querySelector("#photoGrid"),
  preview: document.querySelector("#entryPreview"),
  linkForm: document.querySelector("#linkForm"),
  linkInput: document.querySelector("#linkInput"),
  linkList: document.querySelector("#linkList"),
  entryList: document.querySelector("#entryList"),
  calendarPanel: document.querySelector("#calendarPanel"),
  calendarGrid: document.querySelector("#calendarGrid"),
  calendarMonthLabel: document.querySelector("#calendarMonthLabel"),
  listViewButton: document.querySelector("#listViewButton"),
  calendarViewButton: document.querySelector("#calendarViewButton"),
  prevMonthButton: document.querySelector("#prevMonthButton"),
  nextMonthButton: document.querySelector("#nextMonthButton"),
  search: document.querySelector("#searchInput"),
  newToday: document.querySelector("#newToday"),
  exportBackup: document.querySelector("#exportBackup"),
  importBackup: document.querySelector("#importBackup"),
  toast: document.querySelector("#statusToast"),
  cloudStatus: document.querySelector("#cloudStatus"),
  authForm: document.querySelector("#authForm"),
  authUsername: document.querySelector("#authUsername"),
  authPassword: document.querySelector("#authPassword"),
  signOutButton: document.querySelector("#signOutButton"),
  syncLocalButton: document.querySelector("#syncLocalButton"),
  saveStatus: document.querySelector("#saveStatus"),
  saveNowButton: document.querySelector("#saveNowButton"),
  imageLightbox: document.querySelector("#imageLightbox"),
  lightboxImage: document.querySelector("#lightboxImage"),
  closeLightbox: document.querySelector("#closeLightbox"),
};

let entries = loadEntries();
let selectedDate = todayKey();
let currentView = "list";
let visibleMonth = selectedDate.slice(0, 7);
let saveTimer = null;
let supabase = null;
let currentUser = null;
let cloudReady = false;
let remoteLoading = false;
let saveStatusTimer = null;

init();

async function init() {
  ensureTodayEntry();
  elements.date.value = selectedDate;
  bindEvents();
  renderAll();
  await initCloud();

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

function bindEvents() {
  elements.date.addEventListener("change", () => selectDate(elements.date.value));
  elements.newToday.addEventListener("click", () => selectDate(todayKey()));
  elements.search.addEventListener("input", renderNavigation);
  elements.listViewButton.addEventListener("click", () => setNavigationView("list"));
  elements.calendarViewButton.addEventListener("click", () => setNavigationView("calendar"));
  elements.prevMonthButton.addEventListener("click", () => shiftVisibleMonth(-1));
  elements.nextMonthButton.addEventListener("click", () => shiftVisibleMonth(1));
  elements.closeLightbox.addEventListener("click", closeLightbox);
  elements.imageLightbox.addEventListener("click", (event) => {
    if (event.target === elements.imageLightbox) closeLightbox();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeLightbox();
  });

  [elements.title, elements.mood, elements.content].forEach((element) => {
    element.addEventListener("input", queueCurrentEntrySave);
  });

  elements.photoInput.addEventListener("change", handlePhotoUpload);
  elements.linkForm.addEventListener("submit", handleLinkSubmit);
  elements.exportBackup.addEventListener("click", exportBackup);
  elements.importBackup.addEventListener("change", importBackup);
  elements.authForm.addEventListener("submit", handleSignIn);
  elements.signOutButton.addEventListener("click", handleSignOut);
  elements.syncLocalButton.addEventListener("click", syncLocalEntriesToCloud);
  elements.saveNowButton.addEventListener("click", saveCurrentEntryNow);
}

async function initCloud() {
  setCloudStatus("Lokalny rezim");
  setAuthControls(false);

  if (!hasSupabaseConfig()) {
    setCloudStatus("Dopln Supabase config");
    return;
  }

  try {
    setCloudStatus("Supabase config pripraveny");
    await loadSupabaseLibrary();
    if (!window.supabase?.createClient) {
      setCloudStatus("Supabase JS sa nenacital");
      return;
    }

    supabase = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    });
    setCloudStatus("Supabase pripraveny");

    const { data, error } = await withTimeout(
      supabase.auth.getSession(),
      4000,
      { data: { session: null }, error: null }
    );
    if (error) throw error;
    currentUser = data.session?.user || null;
    cloudReady = Boolean(currentUser);
    setAuthControls(cloudReady);

    supabase.auth.onAuthStateChange(async (_event, session) => {
      currentUser = session?.user || null;
      cloudReady = Boolean(currentUser);
      setAuthControls(cloudReady);
      if (cloudReady) {
        await loadCloudEntries();
      } else {
        entries = loadEntries();
        ensureTodayEntry();
        renderAll();
        setCloudStatus("Lokalny rezim");
      }
    });

    if (cloudReady) {
      await loadCloudEntries();
    } else {
      setCloudStatus("Supabase pripraveny");
    }
  } catch (error) {
    console.error(error);
    setCloudStatus("Supabase sa nenacital");
    showToast("Supabase sa nepodarilo nacitat.");
  }
}

function withTimeout(promise, timeoutMs, fallbackValue) {
  return Promise.race([
    promise,
    new Promise((resolve) => {
      window.setTimeout(() => resolve(fallbackValue), timeoutMs);
    }),
  ]);
}

function loadSupabaseLibrary() {
  if (window.supabase?.createClient) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const existing = document.querySelector(`script[src="${SUPABASE_CDN_URL}"]`);
    const script = existing || document.createElement("script");
    let finished = false;

    const done = () => {
      if (finished) return;
      finished = true;
      resolve();
    };

    script.addEventListener("load", done, { once: true });
    script.addEventListener("error", done, { once: true });

    if (!existing) {
      script.src = SUPABASE_CDN_URL;
      script.async = true;
      document.head.append(script);
    }

    window.setTimeout(done, 4000);
  });
}

function hasSupabaseConfig() {
  return Boolean(
    SUPABASE_CONFIG.url &&
      SUPABASE_CONFIG.anonKey &&
      SUPABASE_CONFIG.url.includes(".supabase.")
  );
}

function setAuthControls(isSignedIn) {
  elements.authForm.classList.toggle("hidden", isSignedIn);
  elements.signOutButton.disabled = !isSignedIn;
  elements.syncLocalButton.disabled = !isSignedIn;
}

function setCloudStatus(message) {
  elements.cloudStatus.textContent = message;
}

async function handleSignIn(event) {
  event.preventDefault();
  if (!supabase) {
    showToast("Supabase sa este nenacital.");
    return;
  }

  const rawUsername = elements.authUsername.value;
  const username = normalizeUsername(rawUsername);
  const password = elements.authPassword.value;
  if (!username || !password) {
    showToast("Zadaj meno aj heslo.");
    return;
  }

  if (username.length < 3) {
    showToast("Meno musi mat aspon 3 znaky.");
    return;
  }

  if (password.length < 6) {
    showToast("Heslo musi mat aspon 6 znakov.");
    return;
  }

  if (username !== rawUsername.trim().toLowerCase()) {
    elements.authUsername.value = username;
    showToast("Meno moze obsahovat len pismena bez diakritiky, cisla, _ alebo -.");
    return;
  }

  const email = authEmailForUsername(username);
  setCloudStatus("Prihlasujem");
  let { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const signup = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username } },
    });
    data = signup.data;
    error = signup.error;

    if (error && /already|registered|exists/i.test(error.message)) {
      showToast("Toto meno uz existuje. Skus spravne heslo.");
      setCloudStatus("Supabase pripraveny");
      return;
    }
  }

  if (error) {
    showToast(error.message);
    setCloudStatus("Supabase pripraveny");
    return;
  }

  currentUser = data.user || data.session?.user || null;
  elements.authPassword.value = "";

  if (currentUser) {
    cloudReady = true;
    setAuthControls(true);
    await loadCloudEntries();
    showToast("Prihlasene.");
  } else {
    showToast("Ucet je vytvoreny. Ak Supabase pyta potvrdenie emailu, vypni email confirmation.");
  }
}

async function handleSignOut() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) {
    showToast(error.message);
    return;
  }
  showToast("Odhlasene.");
}

function createEntry(date) {
  return {
    date,
    title: "",
    mood: "",
    content: "",
    photos: [],
    links: [],
    updatedAt: new Date().toISOString(),
  };
}

function ensureTodayEntry() {
  if (!entries[selectedDate]) {
    entries[selectedDate] = createEntry(selectedDate);
    persistLocal();
  }
}

function selectDate(date) {
  if (!date) return;
  selectedDate = date;
  visibleMonth = selectedDate.slice(0, 7);
  if (!entries[selectedDate]) {
    entries[selectedDate] = createEntry(selectedDate);
    persist();
  }
  elements.date.value = selectedDate;
  renderAll();
}

function queueCurrentEntrySave() {
  window.clearTimeout(saveTimer);
  syncCurrentEntryFromEditor(false);
  setSaveStatus("Ukladam...", "saving");
  renderInlinePreview();
  renderNavigation();
  saveTimer = window.setTimeout(() => {
    saveCurrentEntryNow();
  }, 220);
}

async function saveCurrentEntryNow() {
  window.clearTimeout(saveTimer);
  syncCurrentEntryFromEditor(true);

  setSaveStatus("Ukladam...", "saving");
  renderNavigation();
  renderInlinePreview();

  try {
    const result = await persist();
    if (result === "cloud") {
      setSaveStatus("Synchronizovane", "saved");
    } else {
      setSaveStatus("Ulozene lokalne", "saved");
    }
  } catch (error) {
    console.error(error);
    setSaveStatus("Chyba ukladania", "error");
    showToast("Ukladanie zlyhalo.");
  }
}

function getCurrentEntry() {
  if (!entries[selectedDate]) {
    entries[selectedDate] = createEntry(selectedDate);
  }
  entries[selectedDate].photos = entries[selectedDate].photos || [];
  entries[selectedDate].links = entries[selectedDate].links || [];
  return entries[selectedDate];
}

function syncCurrentEntryFromEditor(touchUpdatedAt) {
  const entry = getCurrentEntry();
  entry.title = elements.title.value.trim();
  entry.mood = elements.mood.value;
  entry.content = elements.content.value;
  entry.photos = entry.photos || [];
  entry.links = entry.links || [];
  if (touchUpdatedAt) {
    entry.updatedAt = new Date().toISOString();
  }
  return entry;
}

function renderAll() {
  renderEditor();
  renderPhotos();
  renderLinks();
  renderInlinePreview();
  renderNavigation();
}

function renderEditor() {
  const entry = getCurrentEntry();
  elements.title.value = entry.title || "";
  elements.mood.value = entry.mood || "";
  elements.content.value = entry.content || "";
}

function renderPhotos() {
  const entry = getCurrentEntry();
  entry.photos = entry.photos || [];
  elements.photoGrid.innerHTML = "";

  if (!entry.photos.length) {
    elements.photoGrid.innerHTML = '<p class="empty-note">Zatial ziadne fotky.</p>';
    return;
  }

  entry.photos.forEach((photo) => {
    const tile = document.createElement("div");
    tile.className = "photo-tile";

    const image = document.createElement("img");
    image.src = photo.signedUrl || photo.dataUrl || "";
    image.alt = photo.name || "Fotka zo zapisku";
    image.addEventListener("click", () => openLightbox(photo));

    const insert = document.createElement("button");
    insert.className = "insert-photo-button";
    insert.type = "button";
    insert.textContent = "Do textu";
    insert.title = "Vlozit fotku do textu";
    insert.addEventListener("click", () => insertPhotoIntoText(photo));

    const remove = document.createElement("button");
    remove.className = "remove-button";
    remove.type = "button";
    remove.textContent = "x";
    remove.title = "Odstranit fotku";
    remove.addEventListener("click", () => removePhoto(photo.id));

    tile.append(image, insert, remove);
    elements.photoGrid.append(tile);
  });
}

async function removePhoto(photoId) {
  const entry = getCurrentEntry();
  const photo = entry.photos.find((item) => item.id === photoId);
  entry.photos = entry.photos.filter((item) => item.id !== photoId);
  entry.updatedAt = new Date().toISOString();

  if (cloudReady && photo?.path) {
    await supabase.storage.from(SUPABASE_CONFIG.photoBucket).remove([photo.path]);
  }

  persist();
  renderPhotos();
  renderNavigation();
  renderInlinePreview();
}

function renderLinks() {
  const entry = getCurrentEntry();
  entry.links = entry.links || [];
  elements.linkList.innerHTML = "";

  if (!entry.links.length) {
    elements.linkList.innerHTML = '<p class="empty-note">Zatial ziadne odkazy.</p>';
    return;
  }

  entry.links.forEach((link) => {
    const item = document.createElement("div");
    item.className = "link-item";

    const anchor = document.createElement("a");
    anchor.href = link.url;
    anchor.target = "_blank";
    anchor.rel = "noreferrer";
    anchor.textContent = link.url;

    const remove = document.createElement("button");
    remove.className = "ghost-button";
    remove.type = "button";
    remove.textContent = "Zmazat";
    remove.addEventListener("click", () => {
      const current = getCurrentEntry();
      current.links = current.links.filter((itemLink) => itemLink.id !== link.id);
      current.updatedAt = new Date().toISOString();
      persist();
      renderLinks();
      renderNavigation();
    });

    item.append(anchor, remove);
    elements.linkList.append(item);
  });
}

function renderNavigation() {
  renderEntryList();
  renderCalendar();
}

function setNavigationView(view) {
  currentView = view;
  elements.entryList.classList.toggle("hidden", currentView !== "list");
  elements.calendarPanel.classList.toggle("hidden", currentView !== "calendar");
  elements.listViewButton.classList.toggle("active", currentView === "list");
  elements.calendarViewButton.classList.toggle("active", currentView === "calendar");
  renderNavigation();
}

function renderEntryList() {
  const query = elements.search.value.trim().toLowerCase();
  const list = Object.values(entries)
    .filter((entry) => matchesQuery(entry, query))
    .sort((a, b) => b.date.localeCompare(a.date));

  elements.entryList.innerHTML = "";

  if (!list.length) {
    elements.entryList.innerHTML = '<p class="empty-note">Nic sa nenaslo.</p>';
    return;
  }

  list.forEach((entry) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `entry-item${entry.date === selectedDate ? " active" : ""}`;
    button.addEventListener("click", () => selectDate(entry.date));

    const date = document.createElement("div");
    date.className = "entry-date";
    date.textContent = formatDate(entry.date);

    const name = document.createElement("div");
    name.className = "entry-name";
    name.textContent = entry.title || "Bez nadpisu";

    const snippet = document.createElement("div");
    snippet.className = "entry-snippet";
    snippet.textContent = previewSnippet(entry);

    button.append(date, name, snippet);
    elements.entryList.append(button);
  });
}

function renderCalendar() {
  const [year, month] = visibleMonth.split("-").map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const query = elements.search.value.trim().toLowerCase();
  const matchingDates = new Set(
    Object.values(entries)
      .filter((entry) => matchesQuery(entry, query))
      .map((entry) => entry.date)
  );

  elements.calendarMonthLabel.textContent = new Intl.DateTimeFormat("sk-SK", {
    month: "long",
    year: "numeric",
  }).format(firstDay);
  elements.calendarGrid.innerHTML = "";

  for (let i = 0; i < startOffset; i += 1) {
    const spacer = document.createElement("span");
    spacer.className = "calendar-spacer";
    elements.calendarGrid.append(spacer);
  }

  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    const date = `${visibleMonth}-${String(day).padStart(2, "0")}`;
    const entry = entries[date];
    const button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-day";
    button.disabled = query && !matchingDates.has(date);
    button.addEventListener("click", () => selectDate(date));

    if (date === selectedDate) button.classList.add("active");
    if (entry && hasEntryText(entry)) button.classList.add("has-entry");

    const dayNumber = document.createElement("span");
    dayNumber.textContent = String(day);

    const dayTitle = document.createElement("small");
    dayTitle.textContent = entry?.title || entry?.mood || "";

    button.append(dayNumber, dayTitle);
    elements.calendarGrid.append(button);
  }
}

function shiftVisibleMonth(direction) {
  const [year, month] = visibleMonth.split("-").map(Number);
  const next = new Date(year, month - 1 + direction, 1);
  visibleMonth = formatMonthKey(next);
  renderCalendar();
}

function matchesQuery(entry, query) {
  if (!query) return true;
  const links = (entry.links || []).map((link) => link.url).join(" ");
  return [entry.date, entry.title, entry.mood, entry.content, links]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

async function handlePhotoUpload(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;

  try {
    const entry = getCurrentEntry();
    const photos = cloudReady
      ? await uploadPhotosToCloud(files)
      : await Promise.all(files.map(readPhoto));
    entry.photos.push(...photos);
    entry.updatedAt = new Date().toISOString();
    persist();
    renderPhotos();
    renderNavigation();
    renderInlinePreview();
    showToast(cloudReady ? "Fotky su ulozene v Supabase." : "Fotky su ulozene v tomto prehliadaci.");
  } catch (error) {
    console.error(error);
    showToast("Fotky sa nepodarilo ulozit.");
  } finally {
    elements.photoInput.value = "";
  }
}

async function uploadPhotosToCloud(files) {
  const userId = currentUser.id;
  const uploaded = [];

  for (const file of files) {
    const id = crypto.randomUUID();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const path = `${userId}/${selectedDate}/${id}-${safeName}`;
    const { error } = await supabase.storage
      .from(SUPABASE_CONFIG.photoBucket)
      .upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
    if (error) throw error;

    const { data } = await supabase.storage
      .from(SUPABASE_CONFIG.photoBucket)
      .createSignedUrl(path, 60 * 60);

    uploaded.push({
      id,
      name: file.name,
      type: file.type,
      path,
      signedUrl: data?.signedUrl || "",
      createdAt: new Date().toISOString(),
    });
  }

  return uploaded;
}

function readPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      resolve({
        id: crypto.randomUUID(),
        name: file.name,
        type: file.type,
        dataUrl: reader.result,
        createdAt: new Date().toISOString(),
      });
    });
    reader.addEventListener("error", reject);
    reader.readAsDataURL(file);
  });
}

function handleLinkSubmit(event) {
  event.preventDefault();
  const url = elements.linkInput.value.trim();
  if (!url) return;

  try {
    const normalized = new URL(url).toString();
    const entry = getCurrentEntry();
    entry.links.push({
      id: crypto.randomUUID(),
      url: normalized,
      createdAt: new Date().toISOString(),
    });
    entry.updatedAt = new Date().toISOString();
    elements.linkInput.value = "";
    persist();
    renderLinks();
    renderNavigation();
  } catch {
    showToast("Toto nevyzera ako platny odkaz.");
  }
}

function exportBackup() {
  const payload = {
    app: "Moje dni",
    version: 2,
    mode: cloudReady ? "supabase" : "local",
    exportedAt: new Date().toISOString(),
    entries,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `moje-dni-zaloha-${todayKey()}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function importBackup(event) {
  const [file] = event.target.files || [];
  if (!file) return;

  const reader = new FileReader();
  reader.addEventListener("load", async () => {
    try {
      const payload = JSON.parse(reader.result);
      const importedEntries = payload.entries || payload;
      if (!importedEntries || typeof importedEntries !== "object") {
        throw new Error("Invalid backup");
      }
      entries = normalizeEntries({ ...entries, ...importedEntries });
      await persistAll();
      renderAll();
      showToast("Zaloha bola importovana.");
    } catch (error) {
      console.error(error);
      showToast("Zalohu sa nepodarilo nacitat.");
    } finally {
      elements.importBackup.value = "";
    }
  });
  reader.readAsText(file);
}

async function loadCloudEntries() {
  if (!cloudReady || remoteLoading) return;
  remoteLoading = true;
  setCloudStatus("Nacitavam Supabase");

  try {
    const { data, error } = await supabase
      .from("diary_entries")
      .select("entry_date,title,mood,content,photos,links,updated_at")
      .order("entry_date", { ascending: false });
    if (error) throw error;

    entries = {};
    for (const row of data || []) {
      entries[row.entry_date] = {
        date: row.entry_date,
        title: row.title || "",
        mood: row.mood || "",
        content: row.content || "",
        photos: await withSignedPhotoUrls(row.photos || []),
        links: row.links || [],
        updatedAt: row.updated_at || new Date().toISOString(),
      };
    }

    ensureTodayEntry();
    renderAll();
    setCloudStatus(`Supabase: ${displayNameForUser(currentUser)}`);
  } catch (error) {
    console.error(error);
    setCloudStatus("Supabase chyba");
    showToast("Cloudove dni sa nepodarilo nacitat.");
  } finally {
    remoteLoading = false;
  }
}

async function withSignedPhotoUrls(photos) {
  if (!cloudReady) return photos;

  return Promise.all(
    photos.map(async (photo) => {
      if (!photo.path) return photo;
      const { data, error } = await supabase.storage
        .from(SUPABASE_CONFIG.photoBucket)
        .createSignedUrl(photo.path, 60 * 60);
      return {
        ...photo,
        signedUrl: error ? "" : data?.signedUrl || "",
      };
    })
  );
}

async function syncLocalEntriesToCloud() {
  if (!cloudReady) return;
  const localEntries = loadEntries();
  const dates = Object.keys(localEntries);
  if (!dates.length) {
    showToast("Nie su tu lokalne dni na nahratie.");
    return;
  }

  entries = { ...entries, ...localEntries };
  await persistAll();
  renderAll();
  showToast("Lokalne dni boli nahrate do Supabase.");
}

async function persistAll() {
  setSaveStatus("Ukladam...", "saving");
  persistLocal();
  if (!cloudReady) {
    setSaveStatus("Ulozene lokalne", "saved");
    return;
  }
  for (const entry of Object.values(entries)) {
    await ensureCloudPhotos(entry);
    await saveEntryToCloud(entry);
  }
  renderPhotos();
  setSaveStatus("Synchronizovane", "saved");
}

async function persist() {
  persistLocal();
  if (cloudReady) {
    await saveEntryToCloud(getCurrentEntry());
    return "cloud";
  }
  return "local";
}

function persistLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

async function saveEntryToCloud(entry) {
  if (!cloudReady || !currentUser) return;
  await ensureCloudPhotos(entry);

  const photos = (entry.photos || []).map(({ signedUrl, dataUrl, ...photo }) => photo);
  const { error } = await supabase.from("diary_entries").upsert(
    {
      user_id: currentUser.id,
      entry_date: entry.date,
      title: entry.title || "",
      mood: entry.mood || "",
      content: entry.content || "",
      photos,
      links: entry.links || [],
      updated_at: entry.updatedAt || new Date().toISOString(),
    },
    { onConflict: "user_id,entry_date" }
  );
  if (error) throw error;
}

async function ensureCloudPhotos(entry) {
  if (!cloudReady || !currentUser) return;
  entry.photos = entry.photos || [];

  for (const photo of entry.photos) {
    if (photo.path || !photo.dataUrl) continue;

    const response = await fetch(photo.dataUrl);
    const blob = await response.blob();
    const id = photo.id || crypto.randomUUID();
    const safeName = (photo.name || `${id}.jpg`).replace(/[^a-zA-Z0-9._-]/g, "-");
    const path = `${currentUser.id}/${entry.date}/${id}-${safeName}`;
    const { error } = await supabase.storage
      .from(SUPABASE_CONFIG.photoBucket)
      .upload(path, blob, {
        contentType: photo.type || blob.type || "image/jpeg",
        upsert: false,
      });
    if (error) throw error;

    const { data } = await supabase.storage
      .from(SUPABASE_CONFIG.photoBucket)
      .createSignedUrl(path, 60 * 60);

    photo.id = id;
    photo.path = path;
    photo.signedUrl = data?.signedUrl || "";
    delete photo.dataUrl;
  }
}

function loadEntries() {
  try {
    return normalizeEntries(JSON.parse(localStorage.getItem(STORAGE_KEY)) || {});
  } catch {
    return {};
  }
}

function normalizeEntries(rawEntries) {
  return Object.fromEntries(
    Object.entries(rawEntries || {}).map(([date, entry]) => [
      date,
      {
        ...createEntry(date),
        ...entry,
        date: entry?.date || date,
        photos: entry?.photos || [],
        links: entry?.links || [],
      },
    ])
  );
}

function normalizeUsername(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

function authEmailForUsername(username) {
  return `${username}@cigapp.invalid`;
}

function displayNameForUser(user) {
  return user?.user_metadata?.username || user?.email?.split("@")[0] || "pouzivatel";
}

function todayKey() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function formatMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("sk-SK", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

function attachmentSummary(entry) {
  const parts = [];
  if ((entry.photos || []).length) parts.push(`${entry.photos.length} fotiek`);
  if ((entry.links || []).length) parts.push(`${entry.links.length} odkazov`);
  return parts.join(", ") || "Prazdny zapisok";
}

function previewSnippet(entry) {
  const text = withoutPhotoMarkers(entry.content || "")
    .replace(/\s+/g, " ")
    .trim();
  if (text) return firstSentences(text);
  return entry.mood || attachmentSummary(entry);
}

function firstSentences(text) {
  const matches = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  const snippet = matches.slice(0, 2).join(" ").trim();
  return snippet.length > 180 ? `${snippet.slice(0, 177).trim()}...` : snippet;
}

function hasEntryText(entry) {
  return Boolean(
    entry?.title ||
      entry?.mood ||
      withoutPhotoMarkers(entry?.content || "").trim() ||
      entry?.photos?.length ||
      entry?.links?.length
  );
}

function withoutPhotoMarkers(text) {
  return text.replace(/!\[[^\]]*\]\(photo:[^)]+\)/g, " ");
}

function insertPhotoIntoText(photo) {
  const label = (photo.name || "fotka").replace(/[\[\]\n\r]/g, " ").trim() || "fotka";
  const marker = `![${label}](photo:${photo.id})`;
  const textarea = elements.content;
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  const before = textarea.value.slice(0, start);
  const after = textarea.value.slice(end);
  const prefix = before && !before.endsWith("\n") ? "\n\n" : "";
  const suffix = after && !after.startsWith("\n") ? "\n\n" : "";
  const inserted = `${prefix}${marker}${suffix}`;

  textarea.value = `${before}${inserted}${after}`;
  textarea.focus();
  textarea.selectionStart = textarea.selectionEnd = start + inserted.length;
  queueCurrentEntrySave();
  showToast("Fotka je vlozena do textu.");
}

function renderInlinePreview() {
  const entry = getCurrentEntry();
  const content = elements.content.value;
  elements.preview.innerHTML = "";

  if (!content.trim()) {
    elements.preview.innerHTML = '<p class="empty-note">Nahlad sa zobrazi pocas pisania.</p>';
    return;
  }

  const photoMap = new Map((entry.photos || []).map((photo) => [photo.id, photo]));
  const pattern = /!\[([^\]]*)\]\(photo:([^)]+)\)/g;
  let index = 0;
  let match;

  while ((match = pattern.exec(content))) {
    appendPreviewText(elements.preview, content.slice(index, match.index));
    const photo = photoMap.get(match[2]);
    if (photo) {
      elements.preview.append(createInlinePhoto(photo, match[1]));
    } else {
      appendPreviewText(elements.preview, match[0]);
    }
    index = pattern.lastIndex;
  }

  appendPreviewText(elements.preview, content.slice(index));
}

function appendPreviewText(container, text) {
  if (!text) return;
  const lines = text.split("\n");
  lines.forEach((line, lineIndex) => {
    if (lineIndex > 0) container.append(document.createElement("br"));
    if (line) container.append(document.createTextNode(line));
  });
}

function createInlinePhoto(photo, fallbackAlt) {
  const figure = document.createElement("figure");
  figure.className = "inline-photo";

  const image = document.createElement("img");
  image.src = photo.signedUrl || photo.dataUrl || "";
  image.alt = fallbackAlt || photo.name || "Fotka v texte";
  image.addEventListener("click", () => openLightbox(photo));

  figure.append(image);
  return figure;
}

function openLightbox(photo) {
  const src = photo?.signedUrl || photo?.dataUrl || "";
  if (!src) return;
  elements.lightboxImage.src = src;
  elements.lightboxImage.alt = photo.name || "Zvacseny obrazok";
  elements.imageLightbox.classList.remove("hidden");
}

function closeLightbox() {
  elements.imageLightbox.classList.add("hidden");
  elements.lightboxImage.removeAttribute("src");
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  window.setTimeout(() => elements.toast.classList.remove("visible"), 2400);
}

function setSaveStatus(message, state = "idle") {
  if (!elements.saveStatus) return;

  window.clearTimeout(saveStatusTimer);
  elements.saveStatus.textContent = message;
  elements.saveStatus.dataset.state = state;

  if (state === "saved") {
    saveStatusTimer = window.setTimeout(() => {
      const entry = getCurrentEntry();
      const savedAt = entry.updatedAt ? formatTime(entry.updatedAt) : "";
      elements.saveStatus.textContent = savedAt
        ? `Ulozene ${savedAt}`
        : "Automaticke ukladanie";
      elements.saveStatus.dataset.state = "idle";
    }, 1800);
  }
}

function formatTime(isoDate) {
  return new Intl.DateTimeFormat("sk-SK", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoDate));
}
