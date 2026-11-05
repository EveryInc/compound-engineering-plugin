# jot

Quick notes from the terminal.

```
jot add "call the plumber" --tag home
jot list --tag home
jot search plumber
jot export --format csv > notes.csv
```

## Known rough edges

- `search` reads every note on each call; with a few thousand notes it takes over a second.
- `export --format csv` does not quote commas inside note text, so the CSV breaks in spreadsheets.
- There is no way to edit or delete a note except by hand-editing notes.json.
- Tags are case-sensitive, so `Home` and `home` are different tags.
