// App só de API (as páginas ficam no site estático em livetranslate.church).
export const metadata = { title: 'LiveTranslate API' };

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
