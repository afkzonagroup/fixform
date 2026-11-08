/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Styles of `<repair-form>`, applied through a constructable stylesheet
 * (`adoptedStyleSheets`), so the component needs no `style` element or
 * attribute and works under `style-src 'self'`.
 *
 * Theme it with these custom properties on the element or an ancestor:
 * `--fixform-font`, `--fixform-text`, `--fixform-muted`, `--fixform-background`,
 * `--fixform-surface`, `--fixform-border`, `--fixform-accent`,
 * `--fixform-accent-text`, `--fixform-error`, `--fixform-focus`,
 * `--fixform-radius`. Parts: `form`, `document`, `title`, `field`, `label`,
 * `hint`, `input`, `error`, `button`, `table`, `footer`.
 */
export const COMPONENT_CSS = `
:host{
  --_font:var(--fixform-font,system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans",Arial,sans-serif);
  --_text:var(--fixform-text,#1a1a1a);
  --_muted:var(--fixform-muted,#4a4a4a);
  --_bg:var(--fixform-background,#ffffff);
  --_surface:var(--fixform-surface,#f2f2f2);
  --_border:var(--fixform-border,#6b6b6b);
  --_accent:var(--fixform-accent,#0b5394);
  --_accent-text:var(--fixform-accent-text,#ffffff);
  --_error:var(--fixform-error,#b00020);
  --_focus:var(--fixform-focus,#1a73e8);
  --_radius:var(--fixform-radius,4px);
  display:block;
  container-type:inline-size;
  color:var(--_text);
  background:var(--_bg);
  font:16px/1.5 var(--_font);
  overflow-wrap:anywhere;
  hyphens:auto;
}
:host([hidden]){display:none}
*{box-sizing:border-box}
.doc,.form{max-width:52rem;margin:0 auto;padding:1rem}
h2{font-size:1.375rem;line-height:1.3;margin:0 0 1rem}
h3{font-size:1.0625rem;margin:1.5rem 0 .5rem}
.part{display:block;font-size:.875rem;font-weight:600;color:var(--_muted)}
table{width:100%;border-collapse:collapse;table-layout:fixed}
th,td{text-align:left;vertical-align:top;padding:.5rem .625rem;border:1px solid var(--_border);overflow-wrap:anywhere}
th{width:45%;font-weight:600;background:var(--_surface)}
ul{margin:0;padding-left:1.25rem}
footer{margin-top:1.25rem;font-size:.875rem;color:var(--_muted)}
dl{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:.125rem .75rem;margin:0}
dt{font-weight:600}
dd{margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;overflow-wrap:anywhere;hyphens:none}
fieldset{border:1px solid var(--_border);border-radius:var(--_radius);margin:0 0 1rem;padding:.75rem;min-width:0}
legend{font-weight:600;padding:0 .25rem}
.field{margin:0 0 1rem;min-width:0}
.field:last-child{margin-bottom:0}
label{display:block;font-weight:600;margin-bottom:.25rem}
.choice{display:flex;align-items:flex-start;gap:.5rem;font-weight:400;margin:.25rem 0}
.choice input{margin:.3rem 0 0;width:1.125rem;height:1.125rem;flex:none}
.hint{margin:0 0 .375rem;color:var(--_muted);font-size:.9375rem}
input[type=text],input[type=email],input[type=tel],textarea{
  display:block;width:100%;max-width:100%;min-height:2.75rem;padding:.5rem .625rem;
  font:inherit;color:var(--_text);background:var(--_bg);
  border:1px solid var(--_border);border-radius:var(--_radius);
}
textarea{min-height:5.5rem;resize:vertical}
input[aria-invalid=true],textarea[aria-invalid=true]{border-color:var(--_error);border-width:2px}
.error{margin:.25rem 0 0;color:var(--_error);font-weight:600}
.error[hidden]{display:none}
.summary{border:2px solid var(--_error);border-radius:var(--_radius);padding:.75rem;margin:0 0 1rem;color:var(--_error);font-weight:600}
.summary:focus{outline:3px solid var(--_focus);outline-offset:2px}
.service{border-top:1px solid var(--_border);padding-top:.75rem;margin-top:.75rem}
.service:first-of-type{border-top:0;padding-top:0;margin-top:0}
.row{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:.75rem}
button{
  font:inherit;font-weight:600;min-height:2.75rem;padding:.5rem 1rem;cursor:pointer;
  border-radius:var(--_radius);border:2px solid var(--_accent);
}
button.primary{background:var(--_accent);color:var(--_accent-text)}
button.secondary{background:var(--_bg);color:var(--_accent)}
:focus-visible{outline:3px solid var(--_focus);outline-offset:2px}
.actions{display:flex;flex-wrap:wrap;gap:.75rem;margin-top:1rem}
.sub{border-left:3px solid var(--_border);padding-left:.75rem;margin:0 0 1rem}
@container (max-width:30rem){
  th,td{display:block;width:100%}
  td{border-top:0}
  th{border-bottom:0}
  .row{grid-template-columns:minmax(0,1fr)}
  .doc,.form{padding:.75rem 0}
  h2{font-size:1.25rem}
  dl{grid-template-columns:minmax(0,1fr)}
  dd{margin-bottom:.375rem}
}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
@media (forced-colors:active){button,input,textarea{border:1px solid ButtonText}}
@media print{.form{display:none}tr{break-inside:avoid}}
`;

let shared: CSSStyleSheet | undefined;

/** The shared constructable stylesheet (created once per document realm). */
export function componentSheet(): CSSStyleSheet {
  if (!shared) {
    shared = new CSSStyleSheet();
    shared.replaceSync(COMPONENT_CSS);
  }
  return shared;
}
