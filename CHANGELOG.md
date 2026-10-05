# Changelog

## 0.9.1

- Fixed: with Carolingian UI, the text editor collapsed to zero width, with the toolbar buttons stacked in a column and no text area.
- Diagnostics: builds the test editor inside the same structure as the editor window, checks its shape, and lists other modules' CSS rules that affect it when the shape is wrong.
- Diagnostics: checks where the sidebar tab is drawn on screen and warns when another module moves it.

## 0.9.0

First test release.

- Full-screen transitions with rich text, a color, image or video background, background effects and audio.
- Fade, Slide and Wipe animations.
- A Fade & Cue tab in the sidebar, visible to the GM, with preview, send, search, row colors, import and export.
- Optional scene change while the transition covers the screen.
- GM-only sending, checked by Foundry's server. The GM can always close a transition for everyone; players can close it for themselves when allowed.
- Transition library stored in the GM's user account, out of the players' reach.
- Audio on Foundry's Music channel, preloaded before the transition starts.
- Diagnostics report for bug reports.
- Foundry v13 and v14.
