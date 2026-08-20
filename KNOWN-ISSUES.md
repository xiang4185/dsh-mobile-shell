# Known Issues

This file contains issues that are **known at the current Stable freeze and intentionally not fixed by speculative patches**. Read it together with [`IOS-STABLE-BASELINE.md`](IOS-STABLE-BASELINE.md).

## iOS: keyboard remains open after a successful send

**Status:** Open / deferred. Not a release blocker for `v1.1.1`.

### Reproduction

1. Open an existing conversation on iPhone.
2. Tap the Composer and type a normal message.
3. Send the message successfully.
4. The message is submitted, but the software keyboard remains visible.

### What is already working

- Tapping/focusing the Composer always returns the conversation to the latest message.
- The reader stays bottom-pinned while the keyboard changes the native viewport.
- Repeated keyboard open/close is stable on a true device.
- `keyboardLayoutGuide` remains the only viewport driver.

### Attempts that were tested and rejected

Two narrow approaches were tried on the compatibility branch and **did not make the true-device keyboard reliably dismiss**:

1. Blur the controlled DSH textarea after its draft is consumed.
2. After the same submit signal, ask the native container to call `view.endEditing(true)`.

Because neither attempt solved the real-device behavior, both workaround paths are removed from the Stable code instead of being left as dead or misleading logic.

### Future investigation boundary

Do not reintroduce generic keyboard compensation to solve this issue. In particular, do not add:

- `visualViewport` keyboard handling;
- `UIKeyboardWillChangeFrame` -> JavaScript;
- keyboard-height JavaScript/CSS;
- `scrollIntoView()` keyboard fixes;
- delayed `setTimeout` / rAF scroll compensation;
- a second Capacitor keyboard resize mode.

The next investigation should instrument the actual WKWebView first-responder/focus lifecycle around a real DSH submit and determine whether DSH/React or WKWebView restores focus after submission. Fix the focus lifecycle itself while keeping `keyboardLayoutGuide` as the single viewport driver.

