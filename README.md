# Tramite

Una rete condivisa di persone e collegamenti professionali. Interfaccia statica su GitHub Pages, archivio in un solo repository privato.

**[Apri l’app](https://giusebuild.github.io/networking/)** · La demo contiene soltanto persone inventate e le sue modifiche sono temporanee.

## Uso

**Aggiungi** apre una scheda breve: nome, **Cosa sa fare?**, **Di cosa ha bisogno?**. Solo il nome è obbligatorio. Puoi incollare una presentazione o appunti per preparare una bozza. I tag proposti distinguono capacità offerte, capacità cercate, settori e interessi; sono correggibili e vengono confermati insieme alla scheda. I suggerimenti usano regole locali, non verificano le capacità della persona e non inviano testo a servizi AI.

La **Rete** comprende insieme i contatti di tutti i partecipanti. La ricerca legge contributi, richieste, tag e contesti. **Offre** e **Cerca** filtrano la stessa rete per il tipo di informazione. Le due informazioni hanno icone e colori distinti nelle card, nella scheda e nel modulo. **Chi lo conosce**, nei filtri, seleziona il tramite. Dal proprio avatar si modifica il profilo.

Le informazioni dei conoscenti conservano l’autore. Le dichiarazioni di un partecipante hanno precedenza per la ricerca sul suo profilo. Nomi uguali non uniscono automaticamente persone: scegli una scheda già presente per aggiungere la tua relazione con **Lo conosco anch’io**. Il collegamento al titolare di una scheda creata prima del suo accesso non è automatico.

**Rimuovi il tuo collegamento** conserva il lavoro degli altri; **Elimina contatto** è disponibile per una scheda esclusivamente propria, dopo conferma. I profili dei partecipanti non si eliminano come contatti.

## Accesso al gruppo

L’archivio è `giusebuild/networking-data`, privato. Non serve creare repository personali. Ogni partecipante usa **il proprio account GitHub e il proprio token**. L’identità è verificata e associata all’ID numerico stabile dell’account.

### Proprietario

1. [Crea un token fine-grained](https://github.com/settings/personal-access-tokens/new?name=Tramite&target_name=giusebuild&contents=write).
2. Scegli **Resource owner: giusebuild**, **Only select repositories → networking-data**.
3. Permessi **Contents → Read and write**, con scadenza.
4. Incollalo nell’app. Non occorrono permessi sul repository pubblico o sui workflow.

### Collaboratore

1. Il proprietario lo aggiunge da [networking-data → Collaborators](https://github.com/giusebuild/networking-data/settings/access).
2. Il collaboratore accetta l’invito con il proprio account GitHub.
3. Usa un [token classic con scope repo](https://github.com/settings/tokens/new?description=Tramite&scopes=repo), con scadenza, e accede all’app.

GitHub non supporta attualmente i token fine-grained per i repository di un altro account personale a cui si accede come collaboratore esterno. Il token classic `repo` può accedere anche agli altri repository privati autorizzati dell’utente. [Limiti ufficiali](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#fine-grained-personal-access-tokens-limitations).

Dal menu **Il team**, il proprietario trova l’accesso agli inviti e un link alla guida di ingresso. Quel link non concede permessi: serve l’invito GitHub. La lista nell’app mostra chi ha effettuato l’accesso, non sostituisce l’elenco dei collaboratori su GitHub.

È una beta per un **team fidato**: ogni collaboratore del repository dati può leggere l’intero archivio, incluse le note e i numeri di telefono, e modificarlo direttamente su GitHub. La separazione degli autori nell’interfaccia è organizzativa. Rimuovere l’accesso non ritira le copie già scaricate.

## Rubrica e conversazioni

**Dalla rubrica** seleziona un contatto nei browser compatibili, come Chrome Android. Negli altri browser apre l’importazione di un file `.vcf` esportato dalla rubrica. Su iPhone non è prevista una sincronizzazione continua o un selettore normalmente disponibile in Safari.

Si importano soltanto nome e numeri leggibili; con più contatti scegli quello da usare, rivedi la scheda e confermi. Il limite del file è 900 KB. L’importazione non inventa contributi o richieste e non aggiorna automaticamente la rubrica del telefono. Il numero scelto resta modificabile: usa il prefisso internazionale, per esempio `+39`.

**WhatsApp** apre la conversazione con un messaggio precompilato, da rivedere e inviare personalmente. Per un’introduzione il destinatario è il facilitatore scelto; se il suo numero non è disponibile, resta **Copia messaggio**. Non ci sono invii automatici, API WhatsApp o chat interne. Il collegamento WhatsApp richiede un numero effettivamente registrato al servizio.

Le card e le schede mostrano subito **WhatsApp** e **LinkedIn**, quando disponibili. Per un contatto raggiungibile tramite un collaboratore, **Chiedi un’intro** apre la richiesta al facilitatore. **Aggiungi recapiti** apre il modulo se mancano i canali: si può comunque creare una scheda con il solo nome.

In **WhatsApp e LinkedIn**, nell’inserimento rapido, si aggiungono telefono, URL e titolo. L’URL viene normalizzato e riconosce un profilo già presente anche con un altro nome. **Apri profilo** porta a LinkedIn; **Incolla titolo e presentazione** prepara una bozza dai testi copiati. Nel modulo completo si può anche indicare il titolo separatamente e annullare la bozza prima del salvataggio. Una presentazione incollata non elimina una richiesta già presente.

Il solo URL non importa titolo o presentazione. L’app non scarica né sincronizza profili LinkedIn e non usa proxy di scraping o servizi esterni: il testo incollato viene elaborato sul dispositivo e resta da confermare.

## Dati, salvataggio e recupero

- Il repository pubblico contiene codice, icone, test e demo inventata; il sito non incorpora dati dell’archivio privato.
- `networking-data/network.json` è la fonte condivisa, con storia Git. L’archivio supporta fino a **900 KB**.
- **Resta connesso**, attivo di default, ricorda l’accesso sul dispositivo e riapre direttamente la rete. Non occorre una password aggiuntiva. Token e copia locale restano cifrati con AES-GCM; una chiave non esportabile è conservata in IndexedDB, separata per repository e ID stabile dell’account. Non è un blocco con password: chi usa quel browser può riaprire l’app.
- Senza **Resta connesso**, token e dati restano in memoria. Puoi attivarlo successivamente dal fondo della rete. Se il browser impedisce il salvataggio, l’app lo segnala e resta utilizzabile nella sessione corrente.
- Le vecchie copie con password locale restano leggibili. Sbloccandole una volta vengono convertite all’accesso automatico senza perdere modifiche, base di sincronizzazione o conflitti. Se il salvataggio fallisce, resta utilizzabile la copia precedente.
- **Esci** interrompe l’accesso automatico e rimuove la sessione del dispositivo, la relativa chiave e la copia locale. Prima di uscire con modifiche non sincronizzate viene chiesta conferma. **Dimentica questo dispositivo** rimuove anche un’eventuale vecchia copia con password. I dati già salvati su GitHub restano disponibili. **Aggiorna token** conserva le modifiche in attesa e verifica che il nuovo token appartenga allo stesso account.
- Il token può scadere o essere revocato: l’app segnala di aggiornarlo, senza cancellare le modifiche locali. Su un nuovo dispositivo, dopo logout o dopo la cancellazione dei dati del browser occorre accedere di nuovo. Safari e un’app aggiunta alla Home possono avere archivi separati: usa lo stesso punto di accesso.
- Le pagine dello stesso dominio GitHub Pages condividono l’origine e possono accedere ai dati salvati in quell’origine. Esegui su quel dominio soltanto codice fidato. Token e dati sono disponibili alla pagina durante l’uso; la cifratura locale non separa applicazioni della stessa origine.

La sincronizzazione parte dopo il salvataggio, tornando online, riaprendo la pagina e periodicamente mentre è visibile. Il confronto tra base, copia locale e remoto unisce modifiche indipendenti; le differenze sullo stesso dato richiedono una scelta. Una richiesta comprende testo, tag e data: in caso di conflitto si sceglie una versione completa. Le rimozioni non ricompaiono da cache obsolete. Le collisioni SHA vengono rilette senza sovrascrittura forzata.

La cache offline contiene soltanto il guscio pubblico dell’app, mai le risposte GitHub. Dopo una riapertura, l’uso offline richiede l’accesso ricordato. Una copia locale diventa condivisa quando compare **Salvato su GitHub**.

Dal menu si esportano **JSON**, completo e reimportabile per ID, e **CSV**, apribile in Excel e comprensivo di contributi, richieste, tag, relazioni e telefono. L’importazione JSON unisce e chiede di risolvere differenze, senza cancellare automaticamente persone esistenti. I backup sono in chiaro e senza token; custodiscili come l’archivio. L’esportazione di un conflitto è un file di recupero delle due versioni, non un backup direttamente reimportabile.

## Aggiungere alla Home

Su iPhone, apri l’app in Safari e scegli **Condividi → Aggiungi alla schermata Home**. Nome **Tramite**, icone PNG per la Home e apertura standalone sono già configurati.

## Sviluppo e pubblicazione

Node.js 22 o successivo, nessuna dipendenza di produzione da installare:

```sh
npm test
npm run build
```

Servi `dist/` con un server HTTP statico. Service worker e cifratura richiedono HTTPS o localhost. La configurazione pubblica è `src/config.js`: non inserirvi credenziali.

Il workflow **Verify and publish** verifica e pubblica `dist/` su GitHub Pages a ogni push su `main`. In [Settings → Pages](https://github.com/giusebuild/networking/settings/pages), la sorgente deve essere **GitHub Actions**. Il build include solo i file pubblici previsti; documenti, backup e dati privati non entrano nel sito.

A ogni rilascio dell’app si incrementa `package.json`: il build aggiorna moduli, stile e cache insieme. **Ricarica l’app anche sugli altri dispositivi prima di modificare dati con una nuova versione.** I file precedenti restano leggibili; richieste e telefono sono informazioni facoltative e non impongono una migrazione iniziale.

I test usano dati inventati e API GitHub simulate. L’accesso reale richiede le credenziali del partecipante.

Ispirato all’approccio essenziale di [Conto Cantiere](https://github.com/giusebuild/cantiere). Icone [Lucide](https://lucide.dev), licenza in `THIRD_PARTY_LICENSES.md`.
