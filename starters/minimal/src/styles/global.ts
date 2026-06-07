import { css } from "@madojs/mado";

const sheet = css`
  :root {
    color-scheme: light;
    font-family:
      Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
      "Segoe UI", sans-serif;
    color: #172033;
    background: #f6f7f9;
  }

  body {
    margin: 0;
  }

  a {
    color: #2563eb;
  }

  .shell {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 2rem;
    box-sizing: border-box;
  }

  .panel {
    width: min(100%, 44rem);
    border: 1px solid #d9dee8;
    border-radius: 8px;
    background: white;
    padding: 2rem;
    box-shadow: 0 16px 40px rgb(17 24 39 / 0.08);
  }

  .eyebrow {
    margin: 0 0 0.5rem;
    color: #64748b;
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0 0 0.75rem;
    font-size: clamp(2rem, 6vw, 4rem);
    line-height: 1;
    letter-spacing: 0;
  }

  p {
    max-width: 34rem;
    line-height: 1.6;
  }
`;

document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
