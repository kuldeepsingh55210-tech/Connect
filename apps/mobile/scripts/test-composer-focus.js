/**
 * apps/mobile/scripts/test-composer-focus.js
 *
 * Static and unit verification that ChatScreen composer maintains focus on web and mobile:
 * 1. TextInput maintains a ref (inputRef = useRef<TextInput | null>(null))
 * 2. handleSend invokes inputRef.current?.focus() to refocus after sending
 * 3. TextInput has blurOnSubmit={false} so Enter/Submit doesn't blur the input
 * 4. TextInput is NOT disabled/editable={false} while isSending
 * 5. Send button prevents default on mousedown on web so clicking it does not steal focus
 * 6. Enter key handling on web sends message while Shift+Enter is preserved
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function runComposerFocusTest() {
  console.log('=== STARTING CHAT COMPOSER FOCUS VERIFICATION ===\n');

  const chatScreenPath = path.resolve(__dirname, '../src/screens/ChatScreen.tsx');
  const code = fs.readFileSync(chatScreenPath, 'utf8');

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      passed++;
      console.log(`  PASS: ${name}`);
    } catch (err) {
      console.error(`  FAIL: ${name}`);
      console.error(`        ${err.message}`);
      throw err;
    }
  }

  // 1. Ref declaration
  test('inputRef is declared with useRef<TextInput | null>(null)', () => {
    assert.ok(
      code.includes('const inputRef = useRef<TextInput | null>(null);'),
      'inputRef must be declared with useRef'
    );
  });

  // 2. Ref attached to TextInput
  test('TextInput has ref={inputRef}', () => {
    assert.ok(
      code.includes('ref={inputRef}'),
      'TextInput must attach ref={inputRef}'
    );
  });

  // 3. blurOnSubmit is false
  test('TextInput has blurOnSubmit={false}', () => {
    assert.ok(
      code.includes('blurOnSubmit={false}'),
      'TextInput must specify blurOnSubmit={false}'
    );
  });

  // 4. handleSend calls inputRef.current?.focus()
  test('handleSend invokes inputRef.current?.focus()', () => {
    assert.ok(
      code.includes('inputRef.current?.focus();'),
      'handleSend must call inputRef.current?.focus()'
    );
    // Specifically check in handleSend
    const handleSendIdx = code.indexOf('const handleSend = async () => {');
    assert.ok(handleSendIdx !== -1, 'handleSend must exist');
    const handleSendSlice = code.slice(handleSendIdx, handleSendIdx + 1200);
    assert.ok(
      handleSendSlice.includes('inputRef.current?.focus()'),
      'handleSend body must invoke inputRef.current?.focus()'
    );
  });

  // 5. TextInput is NOT disabled by isSending
  test('TextInput is NOT disabled or editable={false} when isSending', () => {
    const textInputIdx = code.indexOf('testID="chat-text-input"');
    assert.ok(textInputIdx !== -1, 'TextInput testID must exist');
    const textInputSlice = code.slice(textInputIdx - 400, textInputIdx + 100);
    assert.ok(
      !textInputSlice.includes('editable={!isSending}') &&
      !textInputSlice.includes('editable={false}') &&
      !textInputSlice.includes('disabled={isSending}'),
      'TextInput must not be disabled or uneditable during isSending'
    );
  });

  // 6. Send button does not steal focus on web (onMouseDown preventDefault)
  test('Send button prevents default on mousedown on web', () => {
    assert.ok(
      code.includes("Platform.OS === 'web'") &&
      code.includes('onMouseDown') &&
      code.includes('preventDefault'),
      'Send button must call preventDefault on mousedown on web'
    );
  });

  // 7. Enter sends message and Shift+Enter is preserved
  test('Web Enter submits message and Shift+Enter is not intercepted', () => {
    assert.ok(
      code.includes("e.nativeEvent?.key === 'Enter'") &&
      code.includes('!e.nativeEvent?.shiftKey'),
      'Enter must be checked without shiftKey'
    );
  });

  console.log(`\nAll ${passed}/${total} composer focus checks PASSED successfully.\n`);
}

runComposerFocusTest();
