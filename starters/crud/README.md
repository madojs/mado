# __APP_NAME__

Generated with the Mado CRUD starter.

```bash
npm install
npm run dev
```

Open http://localhost:5173.

Use `npm run build` for a production TypeScript build and `npm run serve` to
serve an already-built app.

This starter demonstrates:

- lazy routes;
- Web Components through `component()`;
- an app shell component with Shadow DOM and `<slot>`;
- query params through `queryParam()`;
- async data through `resource()`;
- mutations with invalidation;
- forms through `useForm()`;
- keyed tables through `each()`.

`x-app-shell` uses Shadow DOM because it owns the page frame and projects route
pages through `<slot>`. Page/table/form components can still use global styles:
slotted route pages remain normal document DOM.

Component imports are explicit registration side effects. `main.ts` imports the
global app shell. Feature pages import the components they render, for example
`src/pages/tickets.ts` imports `../components/ticket-list.js` before rendering
`<ticket-list>`.
