# ClientTrace designdokument

Dato: 17. november 2026. Status: samlet design til godkendelse før implementeringsplanen. Der er endnu ikke oprettet et softwareprojekt eller skrevet produktkode.

## Formål

ClientTrace opsamler JavaScript-fejl i Umbraco 17 og skriver dem til Umbracos eksisterende strukturerede logs gennem `Microsoft.Extensions.Logging.ILogger`. Fejlene kan dermed ses i den eksisterende Log Viewer og følge sitets øvrige logdestinationer uden en ekstra tjeneste.

Backoffice er det primære behov. Opsamling på det offentlige website er et eksplicit tilvalg gennem en Razor-helper. Installation og normal brug skal kræve så få handlinger som muligt.

## Aftalt omfang

- Én NuGet-pakke til Umbraco 17, `Umbraco.Community.ClientTrace`.
- Automatisk opsamling i backoffice efter installation og genstart, uden ændringer i views eller obligatorisk konfiguration.
- Opsamling af ufangede JavaScript-fejl og uhåndterede promise-rejections.
- Frontendopsamling via `@Html.AddClientTrace()` i et Razor-view eller layout.
- Client-side sourcemap-oversættelse, når de nødvendige scripts og maps kan tilgås af sidens JavaScript.
- Konfigurerbare udelukkelser af scripts, sidestier og fejl uden identificerbart script.
- Eksisterende logs og Log Viewer bruges til visning. Ingen separat database eller fejloversigt.
- MIT-licens for pakkens egen kode. Tredjepartslicenser bevares.

Første version omfatter ikke `console.error`, andre console-metoder, manuel lognings-API, breadcrumbs, session replay, alarmer, sourcemap-uploads eller arkivering af gamle builds. HTTP-fejlsvar bliver ikke selvstændige rapporter, medmindre de udløser en af de opsamlede fejlhændelser. Fangede exceptions og almindelige backoffice-notifikationer opsamles ikke automatisk.

## Overvejede løsninger og valgt retning

| Løsning | Fordel | Afvejning og beslutning |
|---|---|---|
| Sentry eller elmah.io | Etableret fejlopsamling og flere muligheder for analyse | Kræver en ekstra tjeneste eller platform. Opfylder ikke ønsket om at bruge Umbracos eksisterende logs alene. |
| JSNLog eller anden generel browser-til-server-logger | Samme grundlæggende transport til eksisterende serverlogs | Kræver stadig en konkret Umbraco-backoffice-integration. Vi har valgt en lille målrettet pakke; der er ikke besluttet en JSNLog-afhængighed. |
| ClientTrace med backoffice entry point og valgfri Razor-helper | Automatisk backofficeopsamling og minimal frontendopsætning | Valgt. Vi vedligeholder opsamling, transport og validering, men bruger eksisterende logging og relevante biblioteker. |

For sourcemaps er client-side oversættelse valgt frem for server-side filopslag eller uploads. For frontendaktivering er en almindelig Razor-helper valgt frem for tag helper eller automatisk omskrivning af HTML. Almindelig antiforgery er valgt frem for engangskoder og ekstra signaturordninger. Pakkens egne udelukkelsesregler anvendes før afsendelse; Serilog kan fortsat filtrere efter modtagelsen.

## Installation og aktivering

NuGet-installation skal registrere backoffice-udvidelse, nødvendige serverkomponenter og pakkens endpoints gennem Umbracos understøttede mekanismer. Der skal ikke kræves manuelle ændringer i `Program.cs` ved normal installation. Den præcise registrering skal verificeres på Umbraco 17.

Et `backofficeEntryPoint` registrerer listeners til `window.error` og `window.unhandledrejection` så tidligt som den understøttede integration tillader. Opsamlingen må ikke kalde `preventDefault`, skjule fejl eller erstatte eksisterende handlers. Gentagen initialisering må ikke oprette dublerede listeners.

Frontend aktiveres ved at placere følgende tidligt i `<head>`, før de scripts, der ønskes overvåget:

```cshtml
@Html.AddClientTrace()
```

Helperen skriver et synkront eksternt script-tag til pakkens frontend-bootstrapcontroller. Script-URL'en får versionsbaseret cachebusting svarende til `asp-append-version`, baseret på det faktiske byggede bootstrap-asset. Controlleren returnerer JavaScript med frontendens options, token-URL og report-URL indbygget. Disse oplysninger placeres derfor ikke som særskilte data-attributter på helperens script-tag.

Controllerens svar må ikke caches, så ændret konfiguration slår igennem. De statiske opsamlings- og sourcemap-moduler kan fortsat caches gennem deres versionerede assetnavne eller URL'er. Alle URL'er skal respektere sitets PathBase. Scriptet indeholder ikke besøgendes antiforgery-token og kræver ikke inline eksekverbar JavaScript i HTML. Nødvendig namespace-import skal dokumenteres og holdes minimal. Kald flere steder på samme side må ikke give dublerede rapporter.

Opsamlingen omfatter alle besøgende på de sider, hvor helperen bruges. Implementøren kan selv skrive betingelser omkring helperkaldet. Der tilføjes ikke særlige målgruppe- eller brugerregler i pakken. Ved `Umbraco:Community:ClientTrace:Frontend:Enabled = false` returnerer helperen intet indhold.

## Konfiguration

Konfigurationen ligger under `Umbraco:Community:ClientTrace` med separate sektioner for `Backoffice` og `Frontend`. Ingen indstillinger behøver angives for standardadfærd.

```json
{
  "Umbraco": {
    "Community": {
      "ClientTrace": {
        "Backoffice": {
          "Enabled": true,
          "UseSourceMaps": true,
          "ExcludedScripts": [],
          "ExcludedPaths": [],
          "ExcludeUnidentifiedScripts": false
        },
        "Frontend": {
          "Enabled": true,
          "UseSourceMaps": true,
          "ExcludedScripts": [],
          "ExcludedPaths": [],
          "ExcludeUnidentifiedScripts": false
        }
      }
    }
  }
}
```

| Indstilling | Betydning |
|---|---|
| `Enabled` | Aktiverer opsamlingen for den pågældende sektion. Standard `true`. I `Backoffice` starter opsamlingen automatisk; i `Frontend` kræves stadig helperkaldet. |
| `UseSourceMaps` | Tillader forsøg på oversættelse af stacktraces i browseren for den pågældende sektion. Standard `true`. Kan deaktiveres ved uønskede downloads eller problemer med oversættelsen. |
| `ExcludedScripts` | Scriptadresser og mønstre, hvis fejl skal droppes. Standard tom liste. |
| `ExcludedPaths` | Sidestier og mønstre, hvor alle fejl skal droppes. Standard tom liste. |
| `ExcludeUnidentifiedScripts` | Dropper rapporter uden identificerbart script. Standard `false`. Kan især frasortere promise-rejections uden stacktrace. |

De to sektioner har samme indstillinger og standardværdier, men konfigureres uafhængigt. Der er ingen nedarvning af værdier eller regler mellem dem. Serveren håndhæver også hver sektions `Enabled` ved modtagelse af rapporter; det er ikke kun en instruktion til browseren. For eksempel påvirker `Frontend:ExcludedScripts` ikke backofficeopsamlingen.

Der tilføjes ikke indstillinger til logniveau, loggerkategori, token-header, endpointstier eller sourcemap-timeout i første version. Rapportstørrelse, rate limits og gentagelsesbegrænsning får dokumenterede standarder, som fastlægges og afprøves under implementeringen.

Pakken indeholder `appsettings-schema.Umbraco.Community.ClientTrace.json` med beskrivelser og standardværdier for begge sektioner. En medpakket `buildTransitive`-target registrerer schemaet gennem Umbraco 17's `UmbracoJsonSchemaFiles`, så consuming sites får editorunderstøttelse uden manuel schemaregistrering.

### Matching af udelukkelser

- Uden wildcard kræves præcist match. `*` er det eneste wildcard og matcher nul eller flere tegn, også på tværs af `/`. Regex og yderligere glob-syntaks indgår ikke.
- Et scriptmønster, der starter med `/`, matcher URL'ens path. En fuld HTTP- eller HTTPS-URL matcher også origin. Querystring og fragment ignoreres ved sammenligning.
- `ExcludedPaths` matcher den aktuelle sides path, uden querystring og fragment. I backoffice bruges den aktuelle sti på fejltidspunktet, også efter navigation uden fuldt sideskift.
- Scriptet identificeres gennem fejlens scriptadresse, hvis den findes, ellers første anvendelige script-frame i det oprindelige stacktrace. Promise-rejections behøver ikke have et identificerbart script.
- Udelukkelser evalueres før hentning af sourcemaps og afsendelse. Et udelukket script droppes uden oversættelse.
- En rapport uden identificerbart script beholdes, medmindre `ExcludeUnidentifiedScripts` er `true` eller siden er udelukket.

Som implementeringsstandard foreslås case-sensitive paths, så forskellige filer på case-sensitive hosts ikke sammenblandes. Origin normaliseres gennem URL-parseren. Dette er et teknisk standardvalg, ikke en særskilt brugerindstilling.

## Opsamling og fejlrapport

Browseren normaliserer hændelsen til et lille, afgrænset sæt oplysninger. Der læses ikke vilkårlige objektegenskaber eller serialiseres komplette rejection-objekter. En rejection uden et `Error`-objekt får en begrænset tekstbeskrivelse eller typebeskrivelse.

Rapporten kan indeholde følgende oplysninger, når de findes:

| Logfelt | Indhold |
|---|---|
| `ClientEventType` | `error` eller `unhandledrejection`. |
| `ClientErrorType` | Eksempelvis `TypeError`, når typen kendes. |
| `ClientErrorMessage` | Begrænset fejlbesked. |
| `ClientPagePath` | Sidens path uden querystring og fragment. |
| `ClientScriptUrl` | Identificeret oprindelig scriptadresse, renset for querystring og fragment. |
| `ClientScriptPath` | Scriptadressens path, som også kan bruges ved Serilog-filtrering. |
| `ClientLineNumber` og `ClientColumnNumber` | Position i det oprindelige script, når kendt. |
| `ClientStackTrace` | Oprindeligt stacktrace. |
| `ClientMappedStackTrace` | Oversat stacktrace, hvis oversættelse lykkes helt eller delvist. |

Transportens præcise DTO-navne og manglende felters repræsentation fastlægges under implementeringen. Logfelternes betydning skal forblive tydelig. Versionsoplysninger om Umbraco og pakken kan tilføjes som serverbestemt kontekst, hvis de er enkelt tilgængelige. Browserens platformoplysninger og brugeridentifikatorer er ikke nødvendige i første version.

Ressourceindlæsningsfejl fra eksempelvis billeder og stylesheets indgår ikke som et særskilt opsamlingsområde. `error`-handleren skal skelne relevante JavaScript-fejlhændelser fra øvrige resource events.

## Sourcemaps i browseren

Brugeren har oplyst, at Umbraco 17 udstiller sourcemaps. Implementeringen skal verificere konkret adgang fra sidens JavaScript og mapping af repræsentative backoffice-bundles. Adgang fra DevTools alene er ikke tilstrækkelig.

Ved en relevant fejl forsøger opsamleren at finde mappet gennem scriptets `sourceMappingURL`. Det kan kræve hentning af selve scriptfilen. Der bruges et etableret bibliotek til parsing af stacktraces og sourcemaps, hvor det er nødvendigt. Biblioteker og deres licenser vælges under planlægningen; vi bygger ikke en egen sourcemap-parser.

Parser og maps indlæses først ved behov. Indlæsninger og resultater genbruges på den aktuelle side, og samtidig behandling skal kunne dele en igangværende indlæsning. Hentninger og behandling begrænses i tid og datamængde.

De oprindelige ressourceadresser skal kunne bruges internt til korrekt filhentning, selvom querystrings fjernes fra de indsendte logfelter. Relative map-adresser opløses i forhold til scriptadressen. Mappet skal svare til det bundle, der faktisk fejlede; pakken vedligeholder ikke et arkiv af tidligere builds.

Vi sender det rå stacktrace sammen med det oversatte, når oversættelse lykkes. Manglende maps, CORS- eller CSP-begrænsninger, ugyldige maps, uunderstøttede frames eller timeout må ikke forhindre afsendelse af den almindelige fejlrapport. Delvist oversatte stacktraces skal bevare de frames, der ikke kunne oversættes. Kildekodeudsnit og komplette map-filer sendes ikke til serveren.

## Transport og antiforgery

Backoffice og frontend har separate modtagelsesendpoints. De kan dele normalisering og logningskode, hvor adfærden er den samme, uden at introducere en generel logplatform.

### Backoffice

Et Management API-endpoint kræver gyldigt backoffice-login og backoffice-adgang. Klienten bruger Umbracos understøttede autentificerede HTTP-klient. Den konkrete klientintegration og adgangspolitik verificeres for Umbraco 17. Den offentlige frontendvej må ikke kunne bruges til at skrive hændelser som backoffice-fejl.

### Frontend

Et offentligt frontend-endpoint kræver standard ASP.NET Core-antiforgery, men ikke login. Ved første fejl henter klienten request-tokenet fra et separat endpoint på samme origin. Serveren udsteder den nødvendige antiforgery-cookie; rapporten sendes med request-tokenet i en header. Tokenet opbevares i hukommelsen og genbruges på siden. Samtidige fejl må ikke hver starte deres egen tokenhentning.

Tokenresponsen må ikke caches eller deles mellem besøgende. Helperens HTML skal kunne caches uden at indeholde besøgendes token. Tokenet er ikke en engangstilladelse. Vi erstatter ikke sitets globale antiforgery-adfærd og indfører ikke en separat signaturordning.

Netværksfejl, afvist token eller mislykket afsendelse droppes uden genforsøgsloop. Tokenhentning og rapportering må ikke selv skabe nye opsamlede fejl. Arbejdet er asynkront og må ikke blokere brugerens arbejde. Der opbygges ikke en persistent kø eller offlinefunktion.

## Validering og begrænsninger

Alle browserrapporter behandles som utroværdige input. Backoffice-login viser, at indsendelsen er autoriseret, men beviser ikke, at browserfejlen skete. Offentlige rapporter kan fabrikeres; dette er accepteret. Antiforgery beskytter mod cross-site indsendelser gennem en besøgendes browser og er ikke en anti-bot-løsning.

Serveren validerer typer, tilladte hændelser, tekstlængder og samlet rapportstørrelse. Serveren bestemmer loggerkategori, logniveau og beskedskabelon. Browseren kan ikke angive vilkårlige logegenskaber eller .NET-exceptions. Felter skrives som værdier i faste strukturerede beskeder.

Gentagne fejl undertrykkes i browseren, og modtagelsen har enkel rate limiting. Både udstedelse af frontendtokens og modtagelse af rapporter skal have begrænset ressourceforbrug. Den konkrete mekanisme, nøgler og grænser vælges under implementeringen, herunder adfærd bag proxy og ved flere serverinstanser. Der etableres ikke ekstra infrastruktur alene for pakken.

Cookies, formularværdier og vilkårlige objekter medsendes ikke. Querystrings og fragmenter fjernes fra rapporterede URL-felter og URL'er i stacktraces, hvor parseren kan identificere dem. Fri fejltekst kan stadig indeholde følsomme oplysninger; pakken kan ikke garantere anonymisering af vilkårlige fejlbeskeder. Dette skal fremgå af dokumentationen.

## Logging og visning

Der bruges separate typede loggere, med foreslåede klassenavne:

```text
Umbraco.Community.ClientTrace.BackofficeJavascriptError
Umbraco.Community.ClientTrace.FrontendJavascriptError
```

Disse fulde klassenavne er `SourceContext` gennem `ILogger<T>`. Namespace og klasser må ikke erstattes af en browserbestemt kategori.

Rapporterne logges på `Error` med faste beskedskabeloner, eksempelvis:

```text
Backoffice JavaScript error: {ClientErrorType}: {ClientErrorMessage}
Frontend JavaScript error: {ClientErrorType}: {ClientErrorMessage}
```

Stacktraces gemmes som strukturerede tekstfelter. Vi kaster ikke en serverexception for at få JavaScript-fejlen ind i en bestemt visning. Den præcise feltpræsentation i Umbraco 17 Log Viewer skal verificeres; den røde .NET-exception-boks loves ikke.

Serverens almindelige dato, maskine, proces og requestkontekst beriges af den eksisterende logopsætning. `RequestPath`, `RequestId` og eventuel `ActionName` beskriver indsendelsen til ClientTrace, ikke det browserkald, der oprindeligt fejlede. `ClientPagePath` og scriptfelterne beskriver browserkonteksten.

Pakken ændrer ikke sitets Serilog-destinationer eller globale filtre. Implementøren kan stadig bruge Serilog til yderligere filtrering, men pakkens udelukkelsesregler udføres allerede i browseren.

## Navn, ikon og licens

Navnet er valgt til trods for kendt navnebrug uden for Umbraco, blandt andet npm-pakken `client-trace` og Xtralis-produktnavnet ClientTrace. Den præcise NuGet-tilgængelighed er ikke bekræftet. Dette er ikke en juridisk navnegodkendelse.

- Pakke: `Umbraco.Community.ClientTrace`.
- Helper: `@Html.AddClientTrace()`.
- Konfigurationssektion: `Umbraco:Community:ClientTrace`, med `Backoffice` og `Frontend` som separate undersektioner.
- Licens: MIT.
- Ikon: Lucide Monitor Dot med udfyldt accentprik.
- Baggrund: kobolt `#183B8C`.
- Forgrund: fersken `#FFD6AD`.
- Accentprik: mint `#75F0C1`.

Valgte filer ligger sammen med dokumentet:

- [Ikon som SVG](clienttrace-icons-v2/cobalt-peach.svg).
- [Ikon som PNG, 512 × 512](clienttrace-icons-v2/cobalt-peach.png).
- [Lucides licensmeddelelse](clienttrace-icons-v2/LUCIDE-LICENSE.txt).

Absolut placering af dokument og assets er `C:\Users\skttl\Documents\Codex\2026-11-17\jeg-x20-3\outputs`. SVG og PNG er visuelt kontrolleret, også gennem eksempler i 32, 40 og 64 px. De er ikke afprøvet i NuGet eller Umbraco Marketplace.

## Verificering før første udgivelse

Demositet har en side med helperen og et separat demoscript. Én gang pr. sidevisning laver scriptet efter et tilfældigt interval på 3–6 sekunder enten en ufanget JavaScript-fejl eller en uhåndteret promise-rejection. Siden forklarer adfærden og kan genindlæses for at prøve igen. Demoscriptet indgår ikke i NuGet-pakken.

Implementeringsplanen skal dække følgende adfærd med målrettede automatiske checks og relevante browserforsøg:

1. Installation på et Umbraco 17-site starter backofficeopsamlingen uden manuel registrering.
2. En ufanget JavaScript-fejl og en uhåndteret promise-rejection lander korrekt i logs fra både backoffice og frontend. Rejections uden `Error`-objekt håndteres også.
3. Helperen er nødvendig for frontendopsamling, og gentagen initialisering giver ikke dublerede listeners eller rapporter.
4. Konfigurationen bindes fra `Umbraco:Community:ClientTrace`. Standardværdier, `Enabled`, `UseSourceMaps`, `ExcludedScripts`, `ExcludedPaths`, wildcardmatching og `ExcludeUnidentifiedScripts` virker uafhængigt for `Backoffice` og `Frontend`, også efter backofficenavigation.
5. Kendte sourcemaps oversætter positioner korrekt. Delvis mapping, utilgængelige maps, timeout og deaktiveret oversættelse bevarer almindelig logning.
6. Backoffice-endpoint afviser anonyme forespørgsler. Frontend afviser manglende eller ugyldig antiforgery, og tokendata deles ikke gennem cachet HTML.
7. Ugyldige eller for store rapporter afvises. Rate limiting og gentagelsesbegrænsning holder ressourceforbruget begrænset.
8. Fejl under tokenhentning, mapping og rapportering skaber ikke rekursion, ubehandlede rejections eller vedvarende genforsøg.
9. Logfelterne kan læses og filtreres i Umbracos eksisterende Log Viewer; serverens requestkontekst og browserens kontekst er adskilt.
10. Rensning af rapporterede URL'er fungerer uden at ødelægge de interne adresser, der bruges til sourcemap-hentning.

Tidlige opstartsfejl, som opstår før listeners er registreret, kan blive overset. Fejlrapporter kan gå tabt ved navigation, tablukning, netværksproblemer, browserbegrænsninger eller afviste cookies. Pakken lover ikke fuldstændig eller garanteret levering.

## Åbne forhold til implementeringsplanen

Der mangler ikke yderligere produktvalg for at planlægge arbejdet. Følgende afklares som tekniske opgaver eller praktiske forhold:

- Opret eller vælg repository og ejer. Den aktuelle arbejdsmappe indeholder kun dokument og ikonarbejde, ikke et eksisterende Umbraco-checkout.
- Fastlæg pakkestruktur, .NET-mål, buildværktøj, biblioteker og testopsætning ud fra Umbraco 17's krav.
- Verificér entry pointets faktiske initialiseringstidspunkt, autentificeret Management API-klient, udvidelsesregistrering og konkret sourcemap-adgang.
- Fastlæg dokumenterede standardgrænser og eventuelle begrænsninger ved flere serverinstanser uden at indføre nye tjenester.
- Kontrollér NuGet-id, udgiverrettigheder og senere Marketplace-registrering. Der er ikke givet instruktion om at publicere noget.
- En prerelease før stabil udgivelse er anbefalet, men versionsnummer og udgivelsesproces er ikke besluttet.

Efter godkendelse af dette dokument udarbejdes implementeringsplanen. Designgodkendelse er ikke en tilladelse til at publicere pakken.

## Teknisk baggrund

- [Umbraco 17 logging](https://docs.umbraco.com/umbraco-cms/17.latest/develop-with-umbraco/testing-and-debugging/logging).
- [Umbraco 17 backoffice entry point](https://docs.umbraco.com/umbraco-cms/17.latest/extend-your-project/backoffice-extensions/extending-overview/extension-types/backoffice-entry-point).
- [Umbraco 17 Management API-adgangspolitikker](https://docs.umbraco.com/umbraco-cms/17.latest/extend-your-project/tutorials/creating-a-backoffice-api/access-policies).
- [ASP.NET Core antiforgery](https://learn.microsoft.com/aspnet/core/security/anti-request-forgery?view=aspnetcore-10.0).
- [Antiforgery-tokenudstedelse og cacheheaders](https://learn.microsoft.com/en-us/dotnet/api/microsoft.aspnetcore.antiforgery.iantiforgery.getandstoretokens?view=aspnetcore-10.0).
- [elmah.io sourcemaps](https://docs.elmah.io/sourcemaps/).
- [Chrome DevTools og sourcemap-adgang](https://developer.chrome.com/docs/devtools/developer-resources).
- [Lucide Monitor Dot](https://lucide.dev/icons/monitor-dot) og [licens](https://lucide.dev/license).
