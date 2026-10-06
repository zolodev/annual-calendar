# Årshjul / Annual wheel

Personligt årshjul för återkommande uppgifter. Uppgifterna gäller varje år automatiskt, checklistor bockas av per år och olösta uppgifter följer med som "Försenad" tills de är klara. Svenska och engelska.

Vanilla JS, inga beroenden, inget byggsteg. Data sparas i webbläsarens `localStorage`. Exportera regelbundet som backup.

## Kör

ES-moduler kräver en webbserver (inte `file://`):

```sh
python3 -m http.server 8000
# öppna http://localhost:8000
```

Offline och installation (PWA) kräver `localhost` eller https.

## Test

```sh
bun test
```

## Version

Appens version anges i `js/version.js` och visas i sidfoten. Höj den vid varje release, så laddar service workern om filerna.
Dataformatets version (`format` i `js/store.js`) höjs bara när JSON-strukturen ändras.

Se `PLAN.md` för datamodell och arkitektur.
