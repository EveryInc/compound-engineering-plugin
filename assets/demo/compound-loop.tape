# Compound Engineering — "the second run" demo
# Regenerate with:  vhs assets/demo/compound-loop.tape
# Source and anonymization notes: assets/demo/README.md

Output assets/demo/compound-loop.gif

Set Shell        bash
Set FontFamily   "FiraCode Nerd Font Mono"
Set FontSize     17
Set Width        1500
Set Height       860
Set Padding      28
Set Margin       0
Set Theme        { "name": "ce", "background": "#0d1117", "foreground": "#e6edf3", "black": "#0d1117", "red": "#ff7b72", "green": "#3fb950", "yellow": "#d29922", "blue": "#58a6ff", "magenta": "#bc8cff", "cyan": "#39c5cf", "white": "#e6edf3", "brightBlack": "#6e7681", "brightRed": "#ff7b72", "brightGreen": "#56d364", "brightYellow": "#e3b341", "brightBlue": "#79c0ff", "brightMagenta": "#d2a8ff", "brightCyan": "#56d4dd", "brightWhite": "#ffffff" }
Set TypingSpeed  0ms
Set Framerate    24
Set PlaybackSpeed 1.0

Hide
# Blank the recording shell's prompt and mark this as a take. Together these let the
# capture safely outlive play.sh: no prompt and no cursor draw after it exits, so the
# last frame holds the closing card no matter how Sleep below is tuned.
Type "export PS1='' CE_DEMO_TAKE=1; cd assets/demo; clear"
Enter
Sleep 300ms
Show

Type "bash play.sh"
Enter
Sleep 32s
