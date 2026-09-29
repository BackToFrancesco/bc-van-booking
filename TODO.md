# TODO

Stato al 29/09/2026. Sito online: https://bc-van-booking.vercel.app

## In attesa di risposta da Loris

- [ ] **Luogo di ritiro e riconsegna** per ogni pulmino (è lo stesso per tutti e tre?)
- [ ] **Tariffa applicata**: fissa per pulmino, a km, o diversa per ogni richiesta?
      Se cambia per richiesta → aggiungere un campo "tariffa" da compilare in admin quando si accetta.
- [ ] **Istruzione di riconsegna** per pulmino (es. elettrici: livello di carica; ibrido: pieno di carburante)
- [ ] Email "extra" con il link al modulo chilometraggio (dal documento iniziale): serve ancora? Con quali campi?
- [ ] Foto dei pulmini (opzionali, per le card in home)

Quando arrivano i dati dei punti 1–3, vanno nella tabella `vans` (le righe vuote vengono omesse dall'email di conferma):

```sql
UPDATE vans SET pickup_location = '...', return_instructions = '...', rate = '...' WHERE id = 'pulmino-1';
-- idem per pulmino-2 e pulmino-3
```

## Da fare lato nostro

- [ ] **`ADMIN_EMAIL` su Vercel**: indirizzo che riceve le nuove richieste (ora non impostato → nessuna notifica admin)
- [ ] **Email reali**: farsi dare dall'admin Google Workspace la *Password per le app* dell'account `pulmini@basketconselve.com`
      (account vero, non alias; verifica in due passaggi attiva), poi su Vercel:
      `EMAIL_TRANSPORT=smtp`, `SMTP_USER=pulmini@basketconselve.com`, `SMTP_PASSWORD=<app password>` → Redeploy
- [ ] **Ruotare la password del database Neon** (è passata in chat): Neon → Roles → `neondb_owner` → Reset password,
      poi aggiornare `DATABASE_URL` nel `.env` locale e su Vercel
- [ ] **Branch `dev` su Neon** per lo sviluppo locale: ora il `.env` locale punta al database di produzione
- [ ] Variabili d'ambiente anche per **Preview** su Vercel (ora solo Production → i deploy di preview falliscono)
- [ ] **bc-booking**: applicare lo stesso fix di sicurezza dell'admin (senza `ADMIN_PASSWORD` il cookie admin è falsificabile), vedi commit `60b35d9`
- [ ] Eliminare da Neon le 2 richieste di prova create durante i test, se non servono
