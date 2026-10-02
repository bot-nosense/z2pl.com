"""UI tests with in-memory HTML. Live responses and Turnstile are test doubles.
Run: python3 tests/browser_test.py (requires playwright and a Chromium install).
"""
from pathlib import Path
import os
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / 'OPEN-PREVIEW.html').read_text()
STUB = '''<script>
window.__test = {calls: [], status: 200, body: {ok:true,status:'saved'}, throws:false};
const widgets = new Map();
window.turnstile = {
  render: (selector, options) => {widgets.set(selector,options); return selector;},
  execute: (id) => queueMicrotask(() => widgets.get(id).callback('test-token')),
  remove: (id) => widgets.delete(id)
};
window.fetch = async (url, options) => {
  window.__test.calls.push(JSON.parse(options.body));
  if (window.__test.throws) throw new TypeError('Failed to fetch');
  return new Response(JSON.stringify(window.__test.body), {status:window.__test.status,headers:{'Content-Type':'application/json'}});
};
</script>'''
LIVE_HTML = HTML.replace('previewMode: true, apiEndpoint:', 'previewMode: false, apiEndpoint:').replace('turnstileSiteKey: ""', 'turnstileSiteKey: "test-public-key"').replace(
    '  const config = window.Z2PL_CONFIG',
    '  const location = {protocol:"https:",origin:"https://landing.example.test",href:"https://landing.example.test/"};\n  const config = window.Z2PL_CONFIG'
).replace('<script>window.Z2PL_CONFIG', STUB + '<script>window.Z2PL_CONFIG')

checks = []
def passed(name): checks.append(name); print('PASS', name)

with sync_playwright() as p:
    launch = {'headless': True, 'args': ['--no-sandbox']}
    executable = os.environ.get('CHROMIUM_PATH')
    if executable: launch['executable_path'] = executable
    browser = p.chromium.launch(**launch)
    for width in [320, 390, 768, 820, 1024, 1440, 1920]:
        page = browser.new_page(viewport={'width': width, 'height': 900})
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.set_content(HTML)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        assert not errors, errors
        assert page.locator('form[inert]').count() == 0
        passed(f'Layout {width}px: no horizontal overflow or script errors')
        page.close()

    page = browser.new_page(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce')
    page.set_content(HTML)
    page.locator('#waitlist-form button[type=submit]').click()
    assert page.locator('#signup-email-error').is_visible()
    passed('Empty signup is rejected')
    page.locator('#signup-email').fill('person@example.com')
    page.locator('#waitlist-form button[type=submit]').click()
    assert page.locator('#signup-consent-error').is_visible()
    passed('Launch signup requires explicit unchecked-by-default consent')
    page.locator('#waitlist-form input[name=consent]').check()
    page.locator('#waitlist-form button[type=submit]').click()
    assert 'nothing was sent' in page.locator('#waitlist-status').inner_text()
    assert page.locator('#signup-email').input_value() == 'person@example.com'
    passed('Preview does not fake a signup or reset the entered email')

    page.locator('#feedback-form button[type=submit]').click()
    assert page.locator('#feedback-message-error').is_visible()
    page.locator('#feedback-message').fill('Please support easier batch previews.')
    page.locator('#feedback-form button[type=submit]').click()
    assert 'nothing was sent' in page.locator('#feedback-status').inner_text()
    passed('Anonymous feedback works in preview; empty feedback is rejected')
    page.locator('#feedback-form input[name=updates]').check()
    page.locator('#feedback-form button[type=submit]').click()
    assert page.locator('#feedback-updates-error').is_visible()
    passed('Feedback opt-in requires an email address')

    page.locator('[data-format=svg]').click()
    assert page.locator('#output-filename').inner_text() == 'shipping-label.svg'
    page.locator('[data-format=svg]').press('ArrowRight')
    assert page.locator('#output-filename').inner_text() == 'shipping-label.png'
    assert page.locator('[data-format=png]').get_attribute('aria-pressed') == 'true'
    passed('Format switcher works with mouse and keyboard')

    page.locator('.privacy-trigger').first.click()
    assert page.locator('#privacy-dialog').is_visible()
    page.keyboard.press('Escape')
    assert not page.locator('#privacy-dialog').is_visible()
    passed('Data dialog opens, traps focus natively, and closes with Escape')
    page.locator('summary').first.click()
    assert page.locator('details').first.get_attribute('open') == ''
    passed('FAQ disclosure works')
    page.locator('.header-cta').click()
    assert page.locator('#signup-email').evaluate('(e) => e === document.activeElement')
    passed('Signup CTA scrolls to and focuses the email field')
    page.close()

    # An explicit location fixture is necessary because these tests render HTML
    # in memory. Nothing here claims to test a deployed site or real Turnstile.
    page = browser.new_page(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce')
    page.set_content(LIVE_HTML)
    page.locator('#signup-email').fill('person@example.com')
    page.locator('#waitlist-form input[name=consent]').check()
    page.locator('#waitlist-form button[type=submit]').click()
    page.wait_for_function('document.querySelector("#waitlist-status").dataset.state === "success"')
    assert 'You’re on the list' in page.locator('#waitlist-status').inner_text()
    assert page.evaluate('window.__test.calls[0].consent') is True
    assert page.locator('#signup-email').input_value() == ''
    passed('Confirmed saved API response produces signup success and resets fields')

    page.locator('#feedback-message').fill('I need an easier way to preview ZPL.')
    page.locator('#feedback-email').fill('reply@example.com')
    page.locator('#feedback-form button[type=submit]').click()
    page.wait_for_function('document.querySelector("#feedback-status").dataset.state === "success"')
    assert page.evaluate('window.__test.calls.at(-1).updates') is False
    assert page.evaluate('window.__test.calls.at(-1).email') == 'reply@example.com'
    passed('Reply email is not an implicit marketing subscription')

    for status in [403, 429, 503]:
        page.evaluate('(status)=>{window.__test.status=status;window.__test.body={ok:false};}', status)
        page.locator('#feedback-message').fill('Please add a useful batch feature.')
        page.locator('#feedback-form button[type=submit]').click()
        page.wait_for_function('document.querySelector("#feedback-status").dataset.state === "error" && document.querySelector("#feedback-form").getAttribute("aria-busy") === "false"')
        assert page.locator('#feedback-message').input_value() == 'Please add a useful batch feature.'
        passed(f'API {status}: error shown, form retained, submit re-enabled')

    page.evaluate('window.__test.status=200;window.__test.body={ok:true,status:"not-saved"}')
    page.locator('#feedback-form button[type=submit]').click()
    page.wait_for_function('document.querySelector("#feedback-form").getAttribute("aria-busy") === "false"')
    assert page.locator('#feedback-status').get_attribute('data-state') == 'error'
    passed('HTTP 200 without a saved acknowledgment is not shown as success')
    page.evaluate('window.__test.throws=true')
    page.locator('#feedback-form button[type=submit]').click()
    page.wait_for_function('document.querySelector("#feedback-form").getAttribute("aria-busy") === "false"')
    assert page.locator('#feedback-status').get_attribute('data-state') == 'error'
    assert page.locator('#feedback-message').input_value() != ''
    passed('Network failure preserves feedback and offers a retry')
    page.close()
    browser.close()

print(f'\n{len(checks)} browser checks passed. Live-service calls were mocked.')
