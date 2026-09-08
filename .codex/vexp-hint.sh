#!/bin/bash
# vexp-hint: event-driven orientation hint (UserPromptSubmit). Fails open.
VEXP_BIN="C:/Users/Kenny/AppData/Roaming/npm/node_modules/vexp-cli/node_modules/@vexp/core-win32-x64/bin/vexp-core.exe"
[ -x "$VEXP_BIN" ] || exit 0
"$VEXP_BIN" prompt-hint 2>/dev/null
exit 0
