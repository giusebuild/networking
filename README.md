# Tramite

Una rete condivisa di persone e collegamenti professionali. Interfaccia statica su GitHub Pages, archivio in un solo repository privato.

**[Apri l’app](https://giusebuild.github.io/networking/)** · La demo contiene soltanto persone inventate e le sue modifiche sono temporanee.

## Esigenze multiple · 1.12.0

**Cerco** contiene più esigenze indipendenti: introduzioni commerciali, spazi, professionisti, risorse o confronti. Nel profilo, nei contatti, nell’inserimento rapido e nei moduli condivisi, **Aggiungi esigenza** crea un’altra voce. Basta una frase; i tag sono facoltativi e distinti per voce. Massimo 20 esigenze conservate per scheda e autore.

Ogni esigenza si modifica o rimuove separatamente. **Risolta** nella scheda la chiude con un tap; nel modulo è possibile riaprirla da **Risolte**. Le azioni nel modulo si confermano con il normale Salva. Le risolte restano nell’archivio e nelle esportazioni, mentre ricerca e condivisione usano soltanto quelle attive.

Cerca mostra le esigenze pertinenti senza duplicare la persona. La scheda completa mantiene tutte le esigenze attive, con provenienza e azioni di contatto riferite a ciascuna voce. WhatsApp, email e il messaggio al facilitatore riprendono l’esigenza scelta; nessun invio automatico.

Il testo precedente resta una sola voce completa, senza divisioni automatiche. JSON conserva identificativi, tag, date e stato; CSV riporta anche le risolte. Le modifiche su esigenze diverse si uniscono, quelle sulla stessa voce richiedono confronto. I vecchi link restano leggibili e non possono cancellare una lista dichiarata più recente; appunti e risposte restano separati.

**Aggiornare l’app su tutti i dispositivi prima di modificare l’archivio.** Al primo salvataggio nel nuovo formato l’archivio passa alla versione 2: le app precedenti ne interrompono la lettura e non possono sovrascrivere le esigenze multiple. Non cambiano accesso, repository o infrastruttura. Nessun dato privato è incluso nel sito.

## Uso

**Aggiungi** apre una scheda breve: nome, **Per cosa lo coinvolgeresti?**, **Di cosa ha bisogno?**. Solo il nome è obbligatorio. Puoi incollare una presentazione o appunti per preparare una bozza. I tag proposti distinguono capacità offerte, capacità cercate, settori e interessi; sono correggibili e vengono confermati insieme alla scheda. I suggerimenti usano regole locali, non verificano le capacità della persona e non inviano testo a servizi AI.

La **Rete** comprende insieme i contatti di tutti i partecipanti. La ricerca legge contributi, richieste, tag e contesti. **Offre** e **Cerca** sono filtri della stessa rete: un tap attiva, un secondo tap sul filtro selezionato torna alla rete completa. Non esiste una sezione Tutti separata. La vista completa mantiene anche le conoscenze senza contributi o bisogni ancora descritti. Nei risultati filtrati le card mostrano soltanto il rispettivo blocco. Aprendo una persona si vede sempre la scheda completa. Le due informazioni hanno icone e colori distinti nelle card, nella scheda e nel modulo. **Chi lo conosce**, nei filtri, seleziona il tramite. Dal proprio avatar si modifica il profilo.

Le informazioni dei conoscenti conservano l’autore. Le dichiarazioni di un partecipante hanno precedenza per la ricerca sul suo profilo. Nomi uguali non uniscono automaticamente persone: scegli una scheda già presente per aggiungere la tua relazione con **Lo conosco anch’io**. Il collegamento al titolare di una scheda creata prima del suo accesso non è automatico.

**Rimuovi il tuo collegamento** conserva il lavoro degli altri; **Elimina contatto** è disponibile per una scheda esclusivamente propria, dopo conferma. I profili dei partecipanti non si eliminano come contatti.

## Descrivere il contributo

**Per cosa lo coinvolgeresti?** guida a un’attività concreta e al contesto in cui è utile. Sul proprio profilo e nei moduli pubblici la domanda è **Per cosa possono coinvolgerti?**. Con un testo generico, come Marketing digitale, compare un aiuto breve per precisare cosa si potrebbe realizzare; quando utile suggerisce di aggiungere per chi. I suggerimenti sono facoltativi, non cambiano il testo, non bloccano il salvataggio e non attribuiscono nuove competenze. La classificazione tramite tag rimane separata e correggibile.

**Fai compilare la scheda** non concede accesso alla rete. **Aggiungi al team** riguarda invece i collaboratori che possono accedere all’intero archivio privato. Non esiste ancora un accesso esterno con profilo centrale e consultazione riservata delle opportunità.

## Il tuo collegamento

La scheda della persona mostra chi la conosce. **Modifica collegamento** apre un modulo breve: dove o tramite chi vi conoscete, da quando e quanto vi conoscete. Le quattro scelte sono facoltative e si possono deselezionare. **Note e ultimo contatto** è chiuso finché non serve. Il salvataggio aggiorna soltanto il proprio collegamento, senza cambiare l’offerta, le richieste, i recapiti o le osservazioni degli altri.

La disponibilità generica non viene più richiesta, mostrata o usata nei filtri. L’interesse e i tempi si verificano nella conversazione su una collaborazione concreta. I precedenti valori restano nei dati e nei backup per compatibilità; non vengono cancellati salvando una scheda.

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

**WhatsApp** apre la conversazione con un messaggio precompilato, da rivedere e inviare personalmente. Con Offre il messaggio propone di coinvolgere la persona sul contributo indicato; con Cerca riprende la richiesta per capire come aiutare. Anche l’email e la richiesta al facilitatore seguono il filtro scelto. Senza filtri resta un messaggio di collaborazione generale. Per un’introduzione il destinatario è il facilitatore scelto; se il suo numero non è disponibile, resta **Copia messaggio**. Non ci sono invii automatici, API WhatsApp o chat interne. Il collegamento WhatsApp richiede un numero effettivamente registrato al servizio.

Le card e le schede mostrano subito **WhatsApp**, **Email** e **LinkedIn**, quando disponibili. Basta anche una sola email; telefono e profilo social restano facoltativi. Per un contatto raggiungibile tramite un collaboratore, **Chiedi un’intro** apre la richiesta al facilitatore. **Aggiungi recapiti** apre il modulo se mancano i canali: si può comunque creare una scheda con il solo nome.

In **Come contattarlo**, nell’inserimento rapido, si aggiungono telefono, URL e titolo. L’URL viene normalizzato e riconosce un profilo già presente anche con un altro nome. **Apri profilo** porta a LinkedIn; **Incolla titolo e presentazione** prepara una bozza dai testi copiati. Nel modulo completo si può anche indicare il titolo separatamente e annullare la bozza prima del salvataggio. Una presentazione incollata non elimina una richiesta già presente. Il testo originale resta separato in **Testo originale**: non viene riversato nelle card né usato per la ricerca. Le regole locali propongono una sintesi delle attività riconosciute in Offre e compilano Cerca solo in presenza di una richiesta esplicita. Sono bozze da rivedere, non un’analisi AI del profilo. Non si deducono bisogni dal ruolo o dalle competenze.

LinkedIn apre il profilo, senza messaggio precompilato. Il solo URL non importa titolo o presentazione. L’app non scarica né sincronizza profili LinkedIn e non usa proxy di scraping o servizi esterni: il testo incollato viene elaborato sul dispositivo e resta da confermare.

## Fai compilare la scheda

**Aggiungi → Fai compilare la scheda** prepara un modulo da inviare anche a chi non è ancora nella rete. Non devi creare prima una scheda vuota. Lo stesso link può essere usato per invitare più persone: ognuna genera la propria risposta. La nuova persona compare soltanto quando il mittente apre la risposta e conferma. Se ci sono corrispondenze per nome o recapiti, la conferma propone anche il collegamento a una scheda esistente; il solo nome non unisce automaticamente le persone.

Da una scheda già presente, **Fai compilare la scheda** prepara invece una bozza con nome, Offre, Cerca e recapiti: la persona può confermarli, correggerli o aggiungere informazioni. La bozza usa gli appunti di chi invia o l’ultima risposta ricevuta; non include note personali, contesto della relazione, testo originale importato o osservazioni altrui. Il mittente può vedere la **Bozza condivisa** prima di inviare.

L’invito viene salvato nel repository privato prima di condividerlo. **Condividi scheda** apre il menu del telefono nei browser compatibili; rimangono WhatsApp, email e copia del link. Se nel profilo del mittente manca un recapito per il ritorno, lo può indicare nell’invito: sarà ricordato nel proprio profilo.

Chi riceve il link non ha bisogno di GitHub. Il modulo non carica l’archivio privato. L’invito contiene i riferimenti della richiesta, il nome e gli eventuali recapiti del mittente e, per una persona già mappata, i campi della bozza condivisa. Il link non dà accesso alla rete.

**Rispondi via WhatsApp/email** prepara la risposta e apre direttamente il messaggio al mittente: resta da premere Invia nella propria app. Quando non c’è un canale di ritorno, si usa la condivisione del telefono o la copia della risposta. Il mittente apre il link ricevuto e sceglie **Conferma e aggiorna**; non deve ricopiare i campi. In alternativa, **Impostazioni → Apri una risposta** consente di incollare il link se l’app sulla Home e il browser hanno accessi separati. Non esistono invii di messaggi automatici o scritture anonime nel repository: la ricezione completamente automatica richiederebbe un servizio esterno.

**I dati inseriti dal team restano.** La risposta viene salvata separatamente dagli appunti di chi ha mappato la persona: non sostituisce testi, tag personalizzati, bisogni, contatti noti, originale o relazioni. Anche una risposta vuota conserva ciò che era già annotato. La rete mostra il contributo ricevuto con la fonte **Dalla scheda compilata**, mentre gli appunti precedenti restano consultabili nei dettagli e ricercabili. I recapiti forniti dalla persona sono utilizzabili dalla scheda; quelli annotati dal team rimangono conservati. Nel modulo Modifica si cambiano i propri appunti, separati dalla risposta. JSON conserva entrambi e CSV distingue la fonte con una riga dedicata alla scheda compilata.

Aprire una risposta non salva nulla. La conferma controlla autore e invito; la stessa risposta non si applica di nuovo, e una scheda eliminata o diventata profilo di un partecipante non si aggiorna così. Le osservazioni e una risposta arrivata nel frattempo si uniscono senza cancellarsi; due diverse risposte in conflitto si confrontano come schede complete. I vecchi link restano leggibili e usano le stesse regole conservative.

La risposta non verifica l’identità del compilatore: confermala riconoscendo la persona nella conversazione. I link contengono i dati condivisi nel frammento dell’URL e non sono cifrati: mandali solo alla persona interessata, non pubblicarli. Il codice pubblico non incorpora i dati compilati.

## QR d’invito

**Fai compilare la scheda** mostra il QR con l’icona di Tramite al centro. Basta inquadrarlo per aprire il modulo senza account. Se il mittente indica il proprio WhatsApp o email, il codice viene aggiornato per preparare la risposta nel canale scelto. **Scarica QR** produce un PNG; se il browser non riesce a generarlo, resta disponibile il vettoriale SVG. Il link e gli altri modi di condivisione rimangono utilizzabili.

Il QR viene generato sul dispositivo dalla libreria MIT di Project Nayuki inclusa nel sito, senza servizi QR esterni. Gli inviti nuovi usano una rappresentazione compatta, senza dati di una persona già mappata. Una bozza molto lunga può superare il limite scelto per la leggibilità: in quel caso l’app propone il link. Il codice dell’invito non contiene token GitHub e non concede accesso al repository.

## Una scheda da riutilizzare

**[La tua scheda](https://giusebuild.github.io/networking/profilo.html)** si crea senza GitHub: nome, quando coinvolgerti, cosa cerchi, recapiti facoltativi. Non è un curriculum, un feed o un elenco pubblico di iscritti. Una volta pronta, si condivide lo stesso link con più persone.

Nel modulo ricevuto, **Ricorda la mia scheda su questo dispositivo** conserva i campi che il compilatore conferma. Un successivo invito sullo stesso browser ritrova la scheda pronta da rivedere e inviare. Una bozza che sembra riferirsi a un’altra persona resta separata e non sostituisce automaticamente la scheda personale; è disponibile Usa la mia scheda salvata. Dopo la risposta, La mia scheda da riutilizzare apre il link indipendente dall’invito.

La scheda personale è salvata localmente in chiaro perché contiene solo i campi condivisibili scelti, senza token o dati della rete. Si può disattivare Ricorda o usare Dimentica su questo dispositivo nella propria scheda. Se il browser blocca la memoria locale, il link resta utilizzabile e l’app invita a conservarlo. Nessun account o archivio centrale viene creato; una scheda condivisa si può riaprire su un altro dispositivo e scegliere È la mia scheda → Modifica per riprenderla.

Chi riceve un link può leggerlo e scegliere **Aggiungi alla tua rete**: occorre essere connessi alla propria istanza di Tramite e confermare la scheda. In alternativa, si incolla da **Apri una scheda ricevuta**. Il collegamento propone la persona già mappata quando riconosce la stessa scheda o recapiti; gli appunti e le relazioni restano. Più membri dello stesso team conservano le proprie osservazioni sulla persona. Lo stesso link può essere aggiunto a repository distinti, senza una nuova compilazione.

Dal proprio profilo nell’app, **Condividi la mia scheda** apre direttamente la condivisione del dispositivo; negli altri browser copia il link e lo mostra nello stesso modulo. Non apre una seconda pagina. **Rete** torna alla schermata iniziale. La pagina della scheda personale condivisa ha un proprio ritorno **Rete**; modificando una scheda esistente, **Annulla** torna alla versione mostrata. Il link contiene solo i propri campi. Non esporta note, relazioni o schede degli altri e non salva implicitamente le modifiche del modulo nel repository: per quelle rimane Salva profilo. L’identità della scheda del membro resta stabile tra dispositivi tramite il repository.

**Ogni link contiene una versione della scheda.** Modificarla genera un nuovo link da inviare: chi ha la copia precedente non riceve aggiornamenti automatici. Il collegamento alla persona resta, evitando nuove schede a ogni versione. L’identità del compilatore non è verificata dal link: chi riceve conferma riconoscendo la persona nella conversazione. I link non sono cifrati e possono essere inoltrati; vanno condivisi soltanto con i destinatari scelti.

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

Dal menu si esportano **JSON**, completo e reimportabile per ID, e **CSV**, apribile in Excel e comprensivo di contributi, richieste, tag, relazioni, telefono, email e testo originale. L’importazione JSON unisce e chiede di risolvere differenze, senza cancellare automaticamente persone esistenti. I backup sono in chiaro e senza token; custodiscili come l’archivio. L’esportazione di un conflitto è un file di recupero delle due versioni, non un backup direttamente reimportabile.

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

A ogni rilascio dell’app si incrementa `package.json`: il build aggiorna moduli, stile e cache insieme, e pubblica `version.json`. L’app controlla la versione all’apertura, tornando in primo piano e periodicamente: una barra in alto propone **Aggiorna**, senza ricaricare durante la compilazione. Prima di ricaricare conserva le modifiche nella copia locale ricordata o chiede di sincronizzarle. In impostazioni è disponibile anche **Controlla aggiornamenti**. Dopo il primo passaggio a questa versione occorre una ricarica manuale per attivare l’avviso sui rilasci successivi. **Ricarica l’app anche sugli altri dispositivi prima di modificare dati con una nuova versione.** I file precedenti restano leggibili; richieste e telefono sono informazioni facoltative e non impongono una migrazione iniziale.

I test usano dati inventati e API GitHub simulate. L’accesso reale richiede le credenziali del partecipante.

Ispirato all’approccio essenziale di [Conto Cantiere](https://github.com/giusebuild/cantiere). Icone [Lucide](https://lucide.dev) e QR di [Project Nayuki](https://www.nayuki.io/page/qr-code-generator-library), licenze in `THIRD_PARTY_LICENSES.md`.
