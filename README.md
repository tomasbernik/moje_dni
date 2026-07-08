# Moje dni

Jednoducha staticka dennikova appka pre GitHub Pages so synchronizaciou cez existujuci Supabase projekt CigApp.

## Supabase setup

1. Otvor existujuci Supabase projekt CigApp.
2. V SQL editore spusti `supabase-schema.sql`.
3. `supabase-config.js` uz pouziva CigApp Project URL a publishable key.
4. V Authentication > URL Configuration pridaj GitHub Pages adresu appky medzi povolene redirect URL.
5. Zapni GitHub Pages pre tento repozitar.

SQL schema vytvori iba objekty pre Moje dni:

- tabulku `public.diary_entries`
- privatny Storage bucket `moje-dni-photos`
- RLS pravidla pre vlastne dennikove zaznamy a fotky

Existujuce CigApp tabulky `packs`, `entries` a `days` nemenime.

Frontend je staticky. Supabase kluc v `supabase-config.js` nie je servisny secret; ochranu dat robi RLS politika v databaze.
