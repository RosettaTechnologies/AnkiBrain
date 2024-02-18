# Changelog

# 0.7.2 
- Make cloze deletions more consistent (still not perfect)
- AnkiBrain will now use its own note types, AnkiBrain-Basic and AnkiBrain-Cloze. This fixes the bug for non-English
users for adding cards to a deck.

# 0.7.1 (beta) - December 7, 2023
- Patch for document deletion

# 0.7.0 (beta) - November 15, 2023
- **New Feature**: custom prompts now available for Topic Explanation and Make Cards features
- Add an option to disable donation reminder
- Add help button to sidebar

# 0.6.8 (beta) - September 28, 2023
- Add individual card delete buttons
- Add an informative error message when adding cards fails

# 0.6.7 (beta) - September 23, 2023
- Add option toggles for: automatically adding cards; deleting cards after adding

# 0.6.6 (beta) - September 18, 2023
- Server Mode: Remove processing cost for documents 
- Server Mode: Increase individual file size limit to 100 MB
- File size limits now made more clear in user interface
  - 1 GB per file for local mode
  - 100 MB per file for server mode
- Add User Interface settings
  - Toggle to disable card interaction hint
- Add a warning when making cards from a document regarding the need for pre-processing (i.e., removing table of contents and other irrelevant pages)

# 0.6.5 (beta) - September 10, 2023
- Every 100 cards will be automatically added to Anki in order to prevent FPS death 
- **Added languages**: Albanian, Armenian, Azerbaijani, Belarusian, Bengali, Bulgarian, Bosnian, Chinese (Cantonese), Croatian, Czech, Danish, Dutch, Estonian, Farsi (Persian), Filipino, Finnish, Greek, Icelandic, Indonesian, Irish (Gaelic), Kazakh, Khmer, Kurdish, Hebrew, Hungarian, Malay, Mongolian, Norwegian, Polish, Romanian, Serbian, Swedish, Thai, Turkish, Ukrainian, Urdu, Vietnamese

# 0.6.4 (beta) - August 24, 2023

- Massive improvements to cloze generation for gpt 3.5 turbo, will consistently produce deletions now!
- Lock the checkout session during a network request to prevent adding balance that may get overwritten during a server
  request

# 0.6.3 (beta) - August 22, 2023

- **New Feature**: Cards will now backup automatically, so if you happen to close Anki before adding your cards, when
  you
  restart you will still have the cards you made!

# 0.6.2 (beta) - August 20, 2023

- **New Feature**: international language support! 12 languages added to dropdown, and you can even type in a custom
  language!
    - Go to Settings -> Basic -> Change AI Language
    - This lets you change the language of the AI (the user interface language will remain the same)
- Add a "Get Help" button to the settings page

# 0.6.1 (beta) - August 17, 2023

- Added new "Failed Cards" tab that will appear when cards have been failed
    - Document => Cards pipeline should no longer halt due to failed cards changes as above
- Improvements to cloze deletions
    - Shortened the output card length
    - GPT-4 continues to produce consistently good cloze deletions
    - GPT 3.5 Turbo often fails to produce the deletions, but still provides good text that you can use to perform
      deletions on

# 0.6.0 (beta) - August 16, 2023

- **New Feature** (Local Mode): making cards from entire document is now enabled!
- Server Mode: new users will now automatically start with free credits
- Local Mode: Internal ~refactoring~ of document importer
- Local Mode: Truncate session use tracker to 2 decimal points
- Local Mode: make sure deleted documents are removed from the list
- Fix boot disclaimer so it pops up only once

# 0.5.2 (beta) - August 15, 2023

- Fix crash after cancelling import document
- Server Mode: Fix document list clearing after deleting documents on the server
- Server Mode: in Add Balance screen, added clarification and tips to pricing
- Server Mode: loosen up rate limiter for certain endpoints

# 0.5.1 (beta) - August 14, 2023

- Quick update to decrease server costs for all users by **40%**!

# 0.5.0 (beta) - August 13, 2013

- **New Feature**: dark mode!
- Various UI tweaks, fixes, modifications

# 0.4.3 (beta) - August 6, 2023

- Add donate button
- Cloze cards using GPT-4 is now perfect. All users can access GPT-4 via Regular Mode, but local mode users need to have
  access to GPT-4 via their OpenAI account.
- Cloze cards using GPT 3.5 Turbo have been improved in terms of length and content. GPT 3.5 Turbo is capable of
  producing deletions and typically does quite well, but has trouble when in local mode for some reason (most likely due
  to
  library differences between JS and Python). Local mode users may have to manually insert cloze deletions into the
  cloze cards provided by AnkiBrain. Basic cards still work great.

# 0.4.2 (beta) - August 5, 2023

- Rename user_data dir to user_files to prevent Anki from aggressively deleting the folder on addon upgrade. For users
  in Local Mode, this means that this update is the **last time you wil get an error screen** and have to reinstall.
  (*Users can therefore delete the /user_data/ folder in order to save space*)
- Remember AnkiBrain interface (sidepanel) show/hide state
- Add stop button to card generation from document
- Add "request free credits" button and form
- Add forms for feature requests and bug reports
- Fix Privacy Policy and TOS links
- Some early restructuring that will allow for **optimizing cloze deletions** in next update

# 0.4.1 (beta) - August 3, 2023

- Add password reset

# 0.4.0 (beta) - August 2, 2023

- **New Feature**: automatically make cards from an entire document at once
- Fix the infamous bug *Expecting value: line 1 column 1*. PDF and other document uploads should work fine now! (25 MB
  limit per file)

# 0.3.1 (beta) - August 2, 2023

- Fix server side daily storage cost

# 0.3.0 (beta) - July 29, 2023

- **Huge Update**: thousands of lines of code to add Regular Mode with webserver support. This allows users to
  do zero setup!
- Various UI fixes
- Add developer mode
- More structural changes to allow for standalone web app in the future
- Privacy policy and terms of service added

# 0.2.0 (beta) - July 12, 2023

- Add support for PDF, DOCX, PPTX, and HTML file importing for AI analysis
- Major internal restructuring
- Add informative app loading messages
- Fix out of step async bug when toggling use documents

# 0.1.3 (beta) - July 5, 2023

- Add SIGINT and SIGTERM cleanup of python subprocess
- Addition of advanced settings, allowing user to choose LLM (gpt-3.5-turbo, gpt-4) and model temperature
- Add token counting and limits to text fields
- Fix bug in editing cards raw JSON (was clearing the cards on save)
- Change "cards added" success message to use a toast instead of window alert
- Increase changelog height

# 0.1.2 (beta) - July 3, 2023

- Add session cost tracker
- Add async command resolvers to react layer for chaining of python calls
- Fix overlapping of chat input text with send button
- Remove duplicate "changelog" text on PostUpdateDialog

# 0.1.1 (beta) - June 28, 2023

- Fix macOS installer script
- Fix line endings for MacOS/Linux
- Adjust macOS and Linux installers to launch a separate command window instead of blocking Anki's UI thread (will no
  longer freeze)
- More informative error messages
- Pass version info to JS layer from settings.json on boot
- Add menu option to show this changelog

# 0.1.0 (beta) - June 20, 2023

- AnkiBrain beta release