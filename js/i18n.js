// Gränssnittstexter sv/en. Månader och datum formateras av Intl.
const T = {
  sv: {
    appName: 'Årshjul', wheel: 'Hjul', wheelSettings: 'Hjulets inställningar', newWheel: '+ Nytt hjul…',
    wheelName: 'Namn på hjulet', delete: 'Ta bort', cancel: 'Avbryt', save: 'Spara', close: 'Stäng',
    search: 'Sök uppgift…', addTask: '+ Uppgift', export: 'Exportera', import: 'Importera',
    units: 'Enheter', manageUnits: 'Hantera enheter', all: 'Alla', open: 'Ej klara', done: 'Klara', status: 'Status',
    wholeYear: 'Hela året', showWholeYear: 'Visa hela året', searchResults: 'Sökresultat',
    nTasks: '{0} uppgifter', nothing: 'Inget att göra här.', late: 'Försenat', lateBadge: 'Försenad · {0}',
    pctDone: '{0}% klart', nLate: '{0} försenade', markDone: 'Klar', prevYear: 'Föregående år', nextYear: 'Nästa år',
    newTask: 'Ny uppgift', editTask: 'Ändra uppgift', title: 'Titel', start: 'Start', end: 'Slut',
    wrapHint: 'Över årsskiftet? Välj slutdatum nästa år.', badRange: 'Slutdatum måste vara efter start och inom ett år.', note: 'Anteckning', checklist: 'Checklista',
    checklistHint: 'En punkt per rad', noUnits: 'Inga enheter ännu.', newUnit: '+ Ny enhet', newUnitName: 'Ny enhet', unitName: 'Namn',
    color: 'Färg', confirmDeleteTask: 'Ta bort uppgiften "{0}"?',
    confirmDeleteUnit: 'Ta bort enheten "{0}"? Uppgifterna finns kvar.', confirmDeleteWheel: 'Ta bort hjulet "{0}" och alla dess uppgifter?',
    confirmReplace: 'Hjulet "{0}" finns redan. Ersätta det med filen?', importFailed: 'Filen kunde inte läsas som ett årshjul.',
    saveFailed: 'Kunde inte spara (lagringen är full eller blockerad).', exported: 'Senast exporterad {0}',
    neverExported: 'Aldrig exporterad – exportera för att ha en backup', defaultWheel: 'Mitt årshjul', defaultUnit: 'Jag',
    otherLang: 'English', otherLangCode: 'en',
  },
  en: {
    appName: 'Annual wheel', wheel: 'Wheel', wheelSettings: 'Wheel settings', newWheel: '+ New wheel…',
    wheelName: 'Wheel name', delete: 'Delete', cancel: 'Cancel', save: 'Save', close: 'Close',
    search: 'Search tasks…', addTask: '+ Task', export: 'Export', import: 'Import',
    units: 'Units', manageUnits: 'Manage units', all: 'All', open: 'Open', done: 'Done', status: 'Status',
    wholeYear: 'Whole year', showWholeYear: 'Show whole year', searchResults: 'Search results',
    nTasks: '{0} tasks', nothing: 'Nothing to do here.', late: 'Overdue', lateBadge: 'Overdue · {0}',
    pctDone: '{0}% done', nLate: '{0} overdue', markDone: 'Done', prevYear: 'Previous year', nextYear: 'Next year',
    newTask: 'New task', editTask: 'Edit task', title: 'Title', start: 'Start', end: 'End',
    wrapHint: 'Crosses New Year? Pick an end date next year.', badRange: 'End date must be after start and within one year.', note: 'Note', checklist: 'Checklist',
    checklistHint: 'One item per line', noUnits: 'No units yet.', newUnit: '+ New unit', newUnitName: 'New unit', unitName: 'Name',
    color: 'Colour', confirmDeleteTask: 'Delete the task "{0}"?',
    confirmDeleteUnit: 'Delete the unit "{0}"? Its tasks are kept.', confirmDeleteWheel: 'Delete the wheel "{0}" and all its tasks?',
    confirmReplace: 'The wheel "{0}" already exists. Replace it with the file?', importFailed: 'The file could not be read as an annual wheel.',
    saveFailed: 'Could not save (storage is full or blocked).', exported: 'Last exported {0}',
    neverExported: 'Never exported – export to keep a backup', defaultWheel: 'My annual wheel', defaultUnit: 'Me',
    otherLang: 'Svenska', otherLangCode: 'sv',
  },
};

export let lang = 'sv';
export const setLang = l => { lang = T[l] ? l : 'en'; document.documentElement.lang = lang; };

export const t = (k, ...a) => (T[lang][k] ?? k).replace(/\{(\d)\}/g, (_, i) => a[i]);

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
export const monthName = (m, style = 'long') =>
  cap(new Intl.DateTimeFormat(lang, { month: style }).format(new Date(2001, m, 1)).replace('.', ''));
export const fmtDate = (d, opts = { day: 'numeric', month: 'short' }) => new Intl.DateTimeFormat(lang, opts).format(d);

// Översätt statiska element: data-i18n (text), data-i18n-ph (placeholder), data-i18n-title (title/aria-label).
export function applyStatic(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  root.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); el.setAttribute('aria-label', el.title); });
}
