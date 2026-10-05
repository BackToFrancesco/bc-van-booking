# TODO

Stato al 05/10/2026. Sito online: https://bc-van-booking.vercel.app

## In attesa di risposta da Loris

- [ ] **Link al Google Form del libretto di bordo**: quando è pronto va nella variabile `LOGBOOK_URL` su Vercel
      (compare da solo nell'email di conferma e nella pagina `/istruzioni`)
- [ ] **Disciplinare aggiornato**: sostituire `public/disciplinare.pdf` (la versione attuale salta dall'art. 3 all'art. 5)
- [ ] Da chiarire con Loris:
  - il disciplinare (art. 3) ammette le associazioni di Conselve **e San Pietro Viminario**; l'avviso sul sito dice solo "Comune di Conselve"
  - il disciplinare (art. 7.2) dice che gli elettrici vanno **sempre** riconsegnati in ricarica; le istruzioni dicono solo sotto il 35%
- [ ] Foto dei pulmini (opzionali, per le card in home)

## Da fare lato nostro

- [ ] **Email reali**: creare la *Password per le app* dell'account `pulmini@basketconselve.com`
      (verifica in due passaggi attiva; la password normale dell'account viene rifiutata da Google), poi su Vercel:
      `EMAIL_TRANSPORT=smtp`, `SMTP_USER=pulmini@basketconselve.com`, `SMTP_PASSWORD=<app password>`,
      `ADMIN_EMAIL=<chi riceve le richieste>` → Redeploy
- [ ] **Ruotare la password del database Neon** (è passata in chat): Neon → Roles → `neondb_owner` → Reset password,
      poi aggiornare `DATABASE_URL` nel `.env` locale (branch dev) e su Vercel (production)
- [ ] Variabili d'ambiente anche per **Preview** su Vercel (ora solo Production → i deploy di preview falliscono)
- [ ] **bc-booking**: applicare lo stesso fix di sicurezza dell'admin (senza `ADMIN_PASSWORD` il cookie admin è falsificabile), vedi commit `60b35d9`
- [ ] Controllare che il link "Apri in Maps" (`PICKUP_MAPS_URL` in `src/lib/config.ts`) porti al punto giusto

## Fatto

- [x] Luogo di ritiro/riconsegna e istruzioni di riconsegna per pulmino (tabella `vans`)
- [x] Tariffa: non riportata nelle email (è nel disciplinare)
- [x] Pagina `/istruzioni` + disciplinare PDF sul sito, email di conferma con le sole cose essenziali
- [x] Branch `dev` su Neon per lo sviluppo locale
- [x] Richieste di prova cancellate dal database di produzione
