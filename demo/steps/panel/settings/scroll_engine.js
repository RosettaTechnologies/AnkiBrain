/* Settings -> Basic. The endpoint block is scrolled into view by the shot's
 * wait, which re-scrolls until it is on screen: the settings screen re-renders
 * when its status fetches land, and a scroll made before that is undone. */
demo.nav('Settings');

//---

demo.clickText('Basic', '[role="tab"], button');
