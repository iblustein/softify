export let activeThemeCode: string = `/* ACTIVE THEME CUSTOMIZATIONS */
body {
  font-family: 'Inter', sans-serif;
  color: #111111;
  background-color: #fafafa;
}

.hero-section {
  padding: 80px 40px;
  background-color: #f3f4f6;
  text-align: center;
}

.hero-title {
  font-size: 2.5rem;
  font-weight: 700;
  letter-spacing: -0.05em;
}

.btn-primary {
  background-color: #008060; /* Shopify Green */
  color: white;
  padding: 12px 24px;
  border-radius: 4px;
}`;

export function getActiveThemeCode(): string {
  return activeThemeCode;
}

export function setActiveThemeCode(newCode: string): void {
  activeThemeCode = newCode;
}
