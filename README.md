# Moje dni

Jednoducha staticka dennikova appka pre GitHub Pages so synchronizaciou cez Neon.

## Neon setup

Projekt pouziva samostatny Neon projekt `falling-frog-37246536`:

- Neon Auth s e-mailovym OTP pre ucet `tomas.bernik@gmail.com`
- Neon Data API a RLS nad tabulkou `public.diary_entries`
- privatny bucket `moje-dni-photos`
- autentifikovanu Neon Function `mojedniphotos` pre pristup k fotografiam

Frontend je staticky a je urceny na nasadenie cez GitHub Pages. Koncove body v `supabase-config.js` su verejne; data chrani Neon Auth, RLS a kontrola JWT vo funkcii pre fotografie.
