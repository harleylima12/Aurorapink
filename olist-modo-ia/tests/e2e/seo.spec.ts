/** Fase 8: SEO e compartilhamento. Metatags do Open Graph/Twitter, imagem 1200×630, robots.txt e sitemap.xml. */
import { expect, test } from '@playwright/test';

test('metatags de compartilhamento, og-image, robots e sitemap', async ({ page, request }) => {
  await page.goto('/');
  const meta = (seletor: string) => page.locator(seletor).getAttribute('content');
  expect(await page.locator('html').getAttribute('lang')).toBe('pt-BR');
  expect((await meta('meta[name="description"]'))?.length).toBeGreaterThan(80);
  expect(await meta('meta[property="og:title"]')).toContain('IA 100% local');
  expect(await meta('meta[property="og:image"]')).toBe('https://olist-modo-ia.vercel.app/og-image.png');
  expect(await meta('meta[name="twitter:card"]')).toBe('summary_large_image');
  expect(await page.locator('link[rel="canonical"]').getAttribute('href')).toBe('https://olist-modo-ia.vercel.app/');

  const og = await request.get('/og-image.png');
  expect(og.ok()).toBe(true);
  const png = await og.body();
  // Cabeçalho PNG: largura e altura nos bytes 16–23.
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
  expect(png.length).toBeLessThan(600_000);

  expect(await (await request.get('/robots.txt')).text()).toContain('Sitemap: https://olist-modo-ia.vercel.app/sitemap.xml');
  expect(await (await request.get('/sitemap.xml')).text()).toContain('<loc>https://olist-modo-ia.vercel.app/avaliacao</loc>');
});
