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
  linkForm: document.querySelector("#linkForm"),
  linkInput: document.querySelector("#linkInput"),
  linkList: document.querySelector("#linkList"),
  entryList: document.querySelector("#entryList"),
  search: document.querySelector("#searchInput"),
  newToday: document.querySelector("#newToday"),
  exportBackup: document.querySelector("#exportBackup"),
  importBackup: document.querySelector("#importBackup"),
  toast: document.querySelector("#statusToast"),
  cloudStatus: document.querySelector("#cloudStatus"),
  authForm: document.querySelector("#authForm"),
  authEmail: document.querySelector("#authEmail"),
  authPassword: document.querySelector("#authPassword"),
  signUpButton: document.querySelector("#signUpButton"),
  signOutButton: document.querySelector("#signOutButton"),
  syncLocalButton: document.querySelector("#syncLocalButton"),
};

let entries = loadEntries();
let selectedDate = todayKey();
let saveTimer = null;
let supabase = null;
let currentUser = null;
let cloudReady = false;
let remoteLoading = false;

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
  elements.search.addEventListener("input", renderEntryList);

  [elements.title, elements.mood, elements.content].forEach((element) => {
    element.addEventListener("input", queueCurrentEntrySave);
  });

  elements.photoInput.addEventListener("change", handlePhotoUpload);
  elements.linkForm.addEventListener("submit", handleLinkSubmit);
  elements.exportBackup.addEventListener("click", exportBackup);
  elements.importBackup.addEventListener("change", importBackup);
  elements.authForm.addEventListener("submit", handleSignIn);
  elements.signUpButton.addEventListener("click", handleSignUp);
  elements.signOutButton.addEventListener("click", handleSignOut);
  elements.syncLocalButton.addEventListener("click", syncLocalEntriesToCloud);
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
  elements.authEmail.disabled = isSignedIn;
  elements.authPassword.disabled = isSignedIn;
  elements.signOutButton.disabled = !isSignedIn;
  elements.syncLocalButton.disabled = !isSignedIn;
}

function setCloudStatus(message) {
  elements.cloudStatus.textContent = message;
}

async function handleSignIn(event) {
  event.preventDefault();
  if (!supabase) {
    showToast("Najprv dopln Supabase config.");
    return;
  }

  const email = elements.authEmail.value.trim();
  const password = elements.authPassword.value;
  if (!email || !password) {
    showToast("Zadaj email aj heslo.");
    return;
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    showToast(error.message);
    return;
  }
  elements.authPassword.value = "";
  showToast("Prihlasene.");
}

async function handleSignUp() {
  if (!supabase) {
    showToast("Najprv dopln Supabase config.");
    return;
  }

  const email = elements.authEmail.value.trim();
  const password = elements.authPassword.value;
  if (!email || password.length < 6) {
    showToast("Heslo musi mat aspon 6 znakov.");
    return;
  }

  const { error } = await supabase.auth.signUp({ email, password });
  if (error) {
    showToast(error.message);
    return;
  }
  elements.authPassword.value = "";
  showToast("Registracia vytvorena. Mozno bude treba potvrdit email.");
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
  if (!entries[selectedDate]) {
    entries[selectedDate] = createEntry(selectedDate);
    persist();
  }
  elements.date.value = selectedDate;
  renderAll();
}

function queueCurrentEntrySave() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    const entry = getCurrentEntry();
    entry.title = elements.title.value.trim();
    entry.mood = elements.mood.value;
    entry.content = elements.content.value;
    entry.updatedAt = new Date().toISOString();
    persist();
    renderEntryList();
  }, 220);
}

function getCurrentEntry() {
  if (!entries[selectedDate]) {
    entries[selectedDate] = createEntry(selectedDate);
  }
  return entries[selectedDate];
}

function renderAll() {
  renderEditor();
  renderPhotos();
  renderLinks();
  renderEntryList();
}

function renderEditor() {
  const entry = getCurrentEntry();
  elements.title.value = entry.title || "";
  elements.mood.value = entry.mood || "";
  elements.content.value = entry.content || "";
}

function renderPhotos() {
  const entry = getCurrentEntry();
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

    const remove = document.createElement("button");
    remove.className = "remove-button";
    remove.type = "button";
    remove.textContent = "x";
    remove.title = "Odstranit fotku";
    remove.addEventListener("click", () => removePhoto(photo.id));

    tile.append(image, remove);
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
  renderEntryList();
}

function renderLinks() {
  const entry = getCurrentEntry();
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
      renderEntryList();
    });

    item.append(anchor, remove);
    elements.linkList.append(item);
  });
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
    snippet.textContent = entry.content || entry.mood || attachmentSummary(entry);

    button.append(date, name, snippet);
    elements.entryList.append(button);
  });
}

function matchesQuery(entry, query) {
  if (!query) return true;
  const links = entry.links.map((link) => link.url).join(" ");
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
    renderEntryList();
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
    renderEntryList();
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
      entries = { ...entries, ...importedEntries };
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
    setCloudStatus(`Supabase: ${currentUser.email}`);
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
  persistLocal();
  if (!cloudReady) return;
  for (const entry of Object.values(entries)) {
    await ensureCloudPhotos(entry);
    await saveEntryToCloud(entry);
  }
  renderPhotos();
}

function persist() {
  persistLocal();
  if (cloudReady) {
    saveEntryToCloud(getCurrentEntry()).catch((error) => {
      console.error(error);
      showToast("Cloud save zlyhal.");
    });
  }
}

function persistLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

async function saveEntryToCloud(entry) {
  if (!cloudReady || !currentUser) return;
  await ensureCloudPhotos(entry);

  const photos = entry.photos.map(({ signedUrl, dataUrl, ...photo }) => photo);
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
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function todayKey() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10);
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
  if (entry.photos.length) parts.push(`${entry.photos.length} fotiek`);
  if (entry.links.length) parts.push(`${entry.links.length} odkazov`);
  return parts.join(", ") || "Prazdny zapisok";
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  window.setTimeout(() => elements.toast.classList.remove("visible"), 2400);
}
