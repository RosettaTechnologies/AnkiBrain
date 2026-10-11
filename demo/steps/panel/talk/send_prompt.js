/* Type the prompt. The value lands in redux on `input`, which the send button
 * reads from its render closure — hence the chunk split before the click. */
demo.setValue('.MessageInputContainer input',
  'Explain the difference between preload and afterload in three sentences.');

//---

demo.click('i.SendButton');
