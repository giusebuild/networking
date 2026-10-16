# Networking

Una rete condivisa di **persone e possibilità**: chi conosciamo, come può aiutare, da dove nasce la relazione.

**[Apri l’app](https://giusebuild.github.io/networking/)** · La demo usa solo persone inventate.

Una pagina, da telefono o computer. Cerca per contributo, competenza, settore, interesse o contesto. Nessuna sezione progetti: prima rendiamo leggibile la rete.

## Come si usa

- **Tutti** mostra la rete del gruppo. **I miei** mostra le persone che conosci tu.
- **Aggiungi** cerca prima le schede esistenti. Se trovi la stessa persona, aggiungi la tua relazione con **Lo conosco anch’io**. Gli omonimi restano separati.
- Ogni relazione ha **contesto, da quando, rapporto, ultimo contatto e nota**. Se conoscete entrambi una persona, compare una sola scheda con due relazioni.
- **Come può aiutare?** raccoglie capacità, esperienza, consigli e collegamenti, con l’autore del contributo. Dal profilo personale: **Come posso aiutarti?**
- **Competenze**, **Ambiti** e **Interessi** restano distinti. Le collaborazioni riportano chi le ha segnalate. La disponibilità dichiarata da un membro ha precedenza sulle osservazioni altrui.
- Ogni partecipante modifica il proprio contributo e la propria relazione. Nome e ruolo dei contatti sono condivisi; un profilo membro si presenta in prima persona.

## Accesso

Questa versione funziona con **due repository e nessun backend**. Il repository dei dati è già configurato: non devi crearne uno per ogni persona.

L’app chiede un **token personale GitHub**, verifica l’identità tramite `GET /user` e usa l’ID numerico stabile dell’account. Non basta selezionare un nome. Il token viene inviato soltanto a `api.github.com` e non entra nei commit, nei backup o negli URL.

### Proprietario

1. [Crea un token fine-grained](https://github.com/settings/personal-access-tokens/new?name=Networking&target_name=giusebuild&contents=write).
2. Resource owner: **giusebuild**. Repository access: **Only select repositories → networking-data**.
3. Repository permissions: **Contents → Read and write**. Imposta una scadenza.
4. Incollalo nell’app e premi **Accedi**.

Non serve dare al token accesso al repository pubblico o ai workflow.

### Un’altra persona

1. Il proprietario la aggiunge come collaboratore a **[networking-data → Settings → Collaborators](https://github.com/giusebuild/networking-data/settings/access)**.
2. La persona accetta l’invito con il **proprio** account GitHub.
3. Per questo repository di un account personale usa un **[token classic con scope repo](https://github.com/settings/tokens/new?description=Networking&scopes=repo)**, poi accede dall’app.

GitHub attualmente non supporta i token fine-grained per un repository collaborator esterno. Il token classic `repo` può accedere anche agli altri repository privati autorizzati di quella persona: è un limite concreto di questa soluzione senza backend. Non condividere il token del proprietario. [Limiti ufficiali GitHub](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#fine-grained-personal-access-tokens-limitations).

Il nuovo profilo si crea al primo accesso. L’invito concede accesso all’**intero archivio condiviso**: la separazione delle relazioni nell’interfaccia è organizzativa. I collaboratori possono leggere e modificare il file anche direttamente su GitHub. Non ci sono password personali che isolano schede o note. Un login email/password o l’isolamento effettivo richiederebbero un intermediario server.

### Questo dispositivo

**Ricorda su questo dispositivo** salva token e cache separati per repository e ID utente, cifrati insieme con AES-GCM. La chiave deriva dalla password locale tramite PBKDF2-SHA-256 (210.000 iterazioni). La password non viene salvata. Per riaprire la copia locale basta la password; per un nuovo dispositivo serve il token GitHub.

La password protegge soltanto la copia locale; non sostituisce GitHub e non è recuperabile. Una password debole rimane attaccabile offline. Le pagine dello stesso dominio GitHub Pages condividono l’origine: esegui su quel dominio soltanto codice di cui ti fidi. Durante la sessione token e dati sono disponibili alla pagina.

Senza **Ricorda**, token e dati restano in memoria: prima di chiudere verifica **Sincronizzato** o scarica un backup. Un account si apre in una sola scheda per evitare che due tab sovrascrivano la stessa cache. **Esci** blocca l’accesso lasciando la copia cifrata; **Dimentica questo dispositivo** la elimina. **Aggiorna token** conserva le modifiche in attesa e verifica che il nuovo token appartenga allo stesso account.

## Dati e sincronizzazione

| Dove | Cosa contiene |
| --- | --- |
| `networking`, pubblico | Interfaccia, codice, test e demo inventata. |
| `networking-data`, privato | Unico archivio condiviso, `network.json`, con storia Git. |
| Browser, se richiesto | Copia cifrata per dispositivo e utente, incluse modifiche non ancora sincronizzate. |
| Backup scaricati | Dati in chiaro, senza credenziali: custodiscili come il file originale. |

L’archivio ha quattro mappe: `members` (ID GitHub → profilo), `people` (identità), `contributions` e `relationships` (persona + autore). Gli ID delle persone non dipendono dai nomi. Una relazione rimossa conserva un tombstone `null` per non riapparire da una vecchia cache.

Ogni sincronizzazione legge l’ultima versione e confronta **base, modifica locale e remoto**. Le modifiche indipendenti si uniscono. Se lo stesso campo cambia in due modi, scegli esplicitamente quale mantenere; puoi esportare entrambe le versioni prima della scelta. Una collisione SHA viene riletta e ritentata, senza sovrascrittura forzata. Un modulo aperto prima di un aggiornamento remoto passa dallo stesso confronto.

La sincronizzazione parte dopo un salvataggio, quando torna la rete, tornando sulla pagina e ogni 45 secondi a pagina visibile. Il pulsante in fondo permette di avviarla subito. Le copie locali non sono la fonte definitiva finché non compare **Sincronizzato**. Se si perde la risposta a un salvataggio, la rilettura riconosce anche un commit già riuscito.

La cache offline del service worker contiene soltanto il guscio pubblico dell’app. Le richieste GitHub e i dati privati non vengono salvati nella Cache API. Per lavorare offline dopo una riapertura serve aver visitato l’app e aver attivato **Ricorda**. L’archivio supporta fino a **900 KB**, mantenendosi entro il limite dell’API Contents usata da questa versione.

## Importazione ed esportazione

Dal menu **⋯**:

- **JSON**: backup completo e reimportabile. L’importazione mostra un riepilogo, unisce per ID e chiede come risolvere valori diversi. Gli ID diversi non vengono uniti per somiglianza di nome. Non elimina automaticamente i contatti già presenti.
- **CSV**: una riga per persona e autore, separatore `;`, UTF-8 con BOM, apribile in Excel. Include contributi, tag e relazione. I valori potenzialmente interpretati come formule vengono neutralizzati. È un’esportazione, non un formato di reimportazione.
- **Conflitto**: esportazione di recupero con le due versioni, senza token. È un file diagnostico da cui estrarre `local` o `incoming` come backup JSON, non un backup direttamente importabile.

Non importare file ricevuti senza verificarne il contenuto. Le note sono visibili al gruppo; evita dettagli personali che non servono alla relazione professionale.

## Pubblicazione

1. In **[Settings → Pages](https://github.com/giusebuild/networking/settings/pages)** seleziona **Source: GitHub Actions**. È una configurazione iniziale del proprietario, non una credenziale dell’app.
2. Il workflow **Verify and publish** esegue test, prepara `dist/` e pubblica su GitHub Pages a ogni push su `main`. Dopo aver attivato Pages, puoi rilanciare il workflow dalla scheda [Actions](https://github.com/giusebuild/networking/actions).

Il build usa una lista esplicita di file pubblici: test, README, backup e file di dati non vengono inclusi nel sito. Percorsi relativi e service worker sono compatibili con `/networking/`.

## Sviluppo

Richiede Node.js 22 o successivo. Nessuna dipendenza da installare, nessun servizio a pagamento.

```sh
npm test
npm run build
```

Servi `dist/` con un server HTTP statico per lo sviluppo locale. Il service worker e la cifratura richiedono HTTPS o localhost. La configurazione pubblica del repository è in `src/config.js`. Non metterci credenziali. Se cambi i file dell’app, aggiorna la versione cache in `sw.js`.

I test coprono identità stabile, più relazioni sulla stessa persona, filtri, validazione, import, merge a tre vie, collisioni SHA, modifiche durante il salvataggio, errori di rete e cifratura della cache. Le API GitHub nei test sono simulate; l’accesso reale richiede le credenziali del partecipante.

Ispirato all’approccio essenziale di **[Conto Cantiere](https://github.com/giusebuild/cantiere)**: codice pubblico, dati privati, pochi passaggi. Icone [Lucide](https://lucide.dev), licenza in `THIRD_PARTY_LICENSES.md`.
