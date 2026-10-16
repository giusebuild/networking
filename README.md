# Networking

Una rete condivisa di **persone e possibilità**: chi conosciamo, come può aiutare, da dove nasce la relazione.

**[Apri l’app](https://giusebuild.github.io/networking/)** · La demo usa solo persone inventate.

Una pagina, da telefono o computer. Cerca per contributo, competenza, settore, interesse o contesto. Nessuna sezione progetti: prima rendiamo leggibile la rete.

## Come si usa

- **Tutti** mostra la rete del gruppo. **I miei** mostra le persone che conosci tu.
- **Aggiungi** cerca prima le schede esistenti. Se trovi la stessa persona, aggiungi la tua relazione con **Lo conosco anch’io**. Gli omonimi restano separati.
- **Elimina persona** rimuove un contatto dalla rete di tutti, incluse le relazioni e i contributi, dopo conferma. **Rimuovi dai miei** toglie soltanto la tua relazione. I profili dei partecipanti non si eliminano come contatti.
- Ogni relazione ha **contesto, da quando, rapporto, ultimo contatto e nota**. Se conoscete entrambi una persona, compare una sola scheda con due relazioni.
- Nel tuo profilo rispondi a **Per cosa possono contattarti?**. Per un contatto: **Per cosa coinvolgeresti questa persona?**. Capacità, esperienza, consigli e collegamenti restano associati al loro autore.
- **Competenze**, **Settori** e **Interessi** restano distinti. I tag si aggiungono toccando i suggerimenti oppure cercando e premendo **+** o Invio. Il testo della presentazione aiuta a proporli. Le collaborazioni riportano chi le ha segnalate. La disponibilità dichiarata da un membro ha precedenza sulle osservazioni altrui.
- Ogni partecipante modifica il proprio contributo e la propria relazione. Nome e ruolo dei contatti sono condivisi; un profilo membro si presenta in prima persona.

## Meno campi, una bozza per iniziare

Dal tuo avatar apri direttamente il profilo modificabile. Nome e una frase possono bastare. La presentazione breve (il vecchio campo `role`), LinkedIn, settori, interessi e disponibilità sono nei dettagli facoltativi. Le relazioni usano scelte rapide; date e note restano disponibili quando servono.

**Incolla testo** prepara nel browser una bozza da una presentazione, dal testo di un profilo o dai tuoi appunti. Riconosce sezioni esplicite e alcuni termini professionali; propone tag distinguendo gli interessi dalle competenze. È una preparazione assistita tramite regole locali, non un modello AI o una verifica delle capacità. Rivedi la bozza, correggila e premi **Salva**. Puoi annullare l’applicazione della bozza prima di salvarla. Nessuna data di conoscenza, livello del rapporto o disponibilità viene inventata.

**LinkedIn è un riferimento, non una sincronizzazione.** Un link viene normalizzato, collegato alla scheda e usato per riconoscere un profilo già presente. Da solo non produce nome, esperienze o competenze. L’app non scarica profili e non invia il testo a LinkedIn o a servizi AI. Le [API dei profili LinkedIn](https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/profile-api) richiedono accessi approvati e prevedono limiti specifici: l’autocompilazione completa di contatti arbitrari da un URL non fa parte di questa versione.

Quando i dati sono salvati, il footer indica **Salvato su GitHub**. **Ricorda accesso** permette di proteggere e conservare l’accesso anche dopo essere entrati, senza ripetere il login.

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

Senza **Ricorda**, token e dati restano in memoria: prima di chiudere verifica **Salvato su GitHub** o scarica un backup. Un account si apre in una sola scheda per evitare che due tab sovrascrivano la stessa cache. **Esci** blocca l’accesso lasciando la copia cifrata; **Dimentica questo dispositivo** la elimina. **Aggiorna token** conserva le modifiche in attesa e verifica che il nuovo token appartenga allo stesso account.

## Dati e sincronizzazione

| Dove | Cosa contiene |
| --- | --- |
| `networking`, pubblico | Interfaccia, codice, test e demo inventata. |
| `networking-data`, privato | Unico archivio condiviso, `network.json`, con storia Git. |
| Browser, se richiesto | Copia cifrata per dispositivo e utente, incluse modifiche non ancora sincronizzate. |
| Backup scaricati | Dati in chiaro, senza credenziali: custodiscili come il file originale. |

L’archivio ha quattro mappe: `members` (ID GitHub → profilo), `people` (identità), `contributions` e `relationships` (persona + autore). Il campo `people[id].linkedin` è facoltativo: i file precedenti restano validi senza migrazione. Gli ID delle persone non dipendono dai nomi. Persone, contributi e relazioni rimossi conservano tombstone `null` per non riapparire da una vecchia cache. Se un contatto viene eliminato mentre un altro dispositivo ne modifica i dati o aggiunge una relazione, il conflitto si risolve con una sola scelta: mantenere la persona completa oppure eliminarla con tutti i riferimenti.

Ogni sincronizzazione legge l’ultima versione e confronta **base, modifica locale e remoto**. Le modifiche indipendenti si uniscono. Se lo stesso campo cambia in due modi, scegli esplicitamente quale mantenere; puoi esportare entrambe le versioni prima della scelta. Una collisione SHA viene riletta e ritentata, senza sovrascrittura forzata. Un modulo aperto prima di un aggiornamento remoto passa dallo stesso confronto.

La sincronizzazione parte dopo un salvataggio, quando torna la rete, tornando sulla pagina e ogni 45 secondi a pagina visibile. Il pulsante in fondo permette di avviarla subito. Le copie locali non sono la fonte definitiva finché non compare **Salvato su GitHub**. Se si perde la risposta a un salvataggio, la rilettura riconosce anche un commit già riuscito.

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

Servi `dist/` con un server HTTP statico per lo sviluppo locale. Il service worker e la cifratura richiedono HTTPS o localhost. La configurazione pubblica del repository è in `src/config.js`. Non metterci credenziali. Quando pubblichi una nuova versione, incrementa la versione in `package.json`: il build aggiorna insieme gli URL dei moduli, lo stile e la cache del service worker, evitando combinazioni di codice vecchio e nuovo. Dopo questo aggiornamento, ricarica anche gli altri dispositivi prima di modificare nuove schede.

I test coprono identità stabile, più relazioni sulla stessa persona, filtri, validazione, import, merge a tre vie, collisioni SHA, modifiche durante il salvataggio, errori di rete e cifratura della cache. Le API GitHub nei test sono simulate; l’accesso reale richiede le credenziali del partecipante.

Ispirato all’approccio essenziale di **[Conto Cantiere](https://github.com/giusebuild/cantiere)**: codice pubblico, dati privati, pochi passaggi. Icone [Lucide](https://lucide.dev), licenza in `THIRD_PARTY_LICENSES.md`.
