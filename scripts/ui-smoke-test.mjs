import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const pageErrors = [];
const consoleErrors = [];

page.on('pageerror', (error) => {
  pageErrors.push(String(error));
});

page.on('console', (message) => {
  if (message.type() === 'error') {
    consoleErrors.push(message.text());
  }
});

try {
  await page.goto('http://127.0.0.1:4321/', {
    waitUntil: 'networkidle',
    timeout: 30_000
  });

  await page.locator('#map').waitFor({ state: 'visible' });

  // Developer popup.
  await page.keyboard.press('Control+Shift+U');
  await page.locator('#devPanel.is-open').waitFor({ state: 'visible' });

  // Enable editor mode and close developer popup.
  await page.locator('#editModeToggle').check();
  await page.waitForTimeout(250);

  console.log('editModeToggle.checked =', await page.locator('#editModeToggle').isChecked());
  console.log('editToggle.class =', await page.locator('#editToggle').getAttribute('class'));
  console.log('page errors before editor close =', JSON.stringify(pageErrors));
  console.log('console errors before editor close =', JSON.stringify(consoleErrors));

  await page.locator('#devPanelClose').click();
  await page.locator('#devPanel').waitFor({ state: 'hidden' });
  await page.locator('#editToggle.is-visible').waitFor({ state: 'visible' });

  // Pencil -> point editor.
  await page.locator('#editToggle').click();
  await page.locator('#editCard.is-open').waitFor({ state: 'visible' });
  await page.locator('.edit-vertex-marker').first().waitFor({ state: 'visible' });

  // Point selection -> point/path actions.
  await page.locator('.edit-vertex-marker').first().click();
  await page.locator('#editDeletePoint:not([hidden])').waitFor({ state: 'visible' });
  await page.locator('#editDelete:not([hidden])').waitFor({ state: 'visible' });

  const pointCountBeforeDelete = await page.locator('.edit-vertex-marker').count();
  await page.locator('#editDeletePoint').click();
  await page.waitForFunction(
    (before) => document.querySelectorAll('.edit-vertex-marker').length < before,
    pointCountBeforeDelete
  );

  // Select another point and delete its whole pedestrian path.
  await page.locator('.edit-vertex-marker').first().click();
  await page.locator('#editDelete:not([hidden])').waitFor({ state: 'visible' });
  const pathPointCountBeforeDelete = await page.locator('.edit-vertex-marker').count();
  await page.locator('#editDelete').click();
  await page.waitForFunction(
    (before) => document.querySelectorAll('.edit-vertex-marker').length < before,
    pathPointCountBeforeDelete
  );

  // Close editor with its X.
  await page.locator('#editCancel').click();
  await page.locator('#editCard').waitFor({ state: 'hidden' });

  // Re-open editor and exercise New path.
  await page.locator('#editToggle').click();
  await page.locator('#editNewPath').click();

  const box = await page.locator('#map').boundingBox();
  if (!box) throw new Error('Map bounding box unavailable.');

  await page.mouse.click(box.x + box.width * 0.42, box.y + box.height * 0.46);
  await page.mouse.click(box.x + box.width * 0.48, box.y + box.height * 0.50);

  await page.locator('#editFinish:not([hidden])').waitFor({ state: 'visible' });
  await page.locator('#editFinish').click();

  // Final editor state should return to point-editing mode.
  await page.locator('#editCard.is-open').waitFor({ state: 'visible' });
  await page.locator('.edit-vertex-marker').first().waitFor({ state: 'visible' });

  // Save the complete edited GeoJSON snapshot.
  await page.keyboard.press('Control+Shift+U');
  await page.locator('#devPanel.is-open').waitFor({ state: 'visible' });
  await page.locator('#savePathEdits').click();
  await page.locator('#pathEditFileStatus').waitFor({ state: 'visible' });
  await page.waitForFunction(
    () => document.getElementById('pathEditFileStatus')?.textContent === 'Saved'
  );
  await page.locator('#devPanelClose').click();
  await page.locator('#devPanel').waitFor({ state: 'hidden' });

  if (pageErrors.length || consoleErrors.length) {
    throw new Error(
      [
        pageErrors.length ? 'pageerror: ' + pageErrors.join(' | ') : '',
        consoleErrors.length ? 'console: ' + consoleErrors.join(' | ') : ''
      ].filter(Boolean).join('\n')
    );
  }

  console.log('CampusMaaS UI smoke test passed.');
} finally {
  await browser.close();
}
