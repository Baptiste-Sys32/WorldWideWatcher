/* eslint-disable no-console */
import { test, expect } from '@playwright/test';

test.describe('Dynamic Plugin System', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to root and wait for app to be completely booted
    await page.goto('/');
    await page.waitForSelector('[data-testid="app-ready"]', { state: 'attached', timeout: 45000 });
  });

  test('successfully discovers, loads, and renders a mock dynamic plugin', async ({ page }) => {
    // Log console messages from the browser
    page.on('console', msg => {
      console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`);
      if (msg.type() === 'error') {
        console.log(`[Browser Error] ${msg.location().url}:${msg.location().lineNumber}`);
      }
    });

    // We expect the mock plugin to register its component in the sidebar.
    // The LeftPanel or RightPanel (depending on how the plugin manager handles generic 'sidebar' capabilities)
    // should render the component returned by getSidebarComponent().
    
    // The mock plugin returns: <div data-testid="e2e-mock-panel">Mock Panel (E2E Test)</div>
    const mockPanel = page.locator('[data-testid="e2e-mock-panel"]');

    // The unverified plugin dialog might appear for the mock plugin.
    const installBtn = page.getByRole('button', { name: /Install Selected/ });
    try {
      // Wait a short time for the dialog to appear
      await installBtn.waitFor({ state: 'visible', timeout: 5000 });
      await installBtn.click();
      console.log('Clicked "Install Selected" in unverified plugin dialog.');
    } catch {
      // Dialog didn't appear, possibly because it's a verified plugin or already approved
      console.log('Unverified plugin dialog did not appear.');
    }

    // To ensure the UI is in a state where it might be visible,
    // let's check if we need to open the right panel first. Plugins might inject into the right panel.
    const rightToggle = page.locator('[data-testid="panel-toggle-right"]');
    if (await rightToggle.count() > 0) {
        const isInitiallyOpen = await rightToggle.evaluate((node) => node.classList.contains('panel-toggle-btn--open'));
        if (!isInitiallyOpen) {
            await rightToggle.click();
        }
    }

    // Click the layer item in the left panel to select it and display its config in the right panel
    const layerItem = page.locator('.layer-item', { hasText: 'E2E Mock Plugin' });
    await expect(layerItem).toBeVisible({ timeout: 10000 });
    await layerItem.click();

    // Wait for the mock panel to be visible or attached.
    // Plugins might take a moment to dynamically load their chunks over HTTP.
    await expect(mockPanel).toBeAttached({ timeout: 10000 });
    
    // Assert it contains the expected text
    await expect(mockPanel).toContainText('Mock Panel (E2E Test)');
  });
});
