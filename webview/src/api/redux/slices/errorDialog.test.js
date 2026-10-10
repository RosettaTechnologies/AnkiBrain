import { store } from "..";
import { dismissErrorDialog, pushErrorDialog } from "./errorDialog";

// The store is a singleton: drain the queue back to a fresh session.
beforeEach(() => {
  while (store.getState().errorDialog.value.current) {
    store.dispatch(dismissErrorDialog());
  }
});

test("the first error is shown immediately", () => {
  store.dispatch(pushErrorDialog({ title: "Chat Error", message: "boom" }));

  expect(store.getState().errorDialog.value.current).toMatchObject({
    title: "Chat Error",
    message: "boom",
  });
  expect(store.getState().errorDialog.value.queue).toEqual([]);
});

test("the same title+message twice is one entry", () => {
  store.dispatch(pushErrorDialog({ title: "Chat Error", message: "boom" }));
  store.dispatch(pushErrorDialog({ title: "Chat Error", message: "boom" }));

  expect(store.getState().errorDialog.value.queue).toEqual([]);

  // Also deduped while the first is still only queued.
  store.dispatch(pushErrorDialog({ title: "Other", message: "x" }));
  store.dispatch(pushErrorDialog({ title: "Other", message: "x" }));
  expect(store.getState().errorDialog.value.queue).toHaveLength(1);
});

test("a distinct error waits in the queue and Next promotes it", () => {
  store.dispatch(pushErrorDialog({ title: "First", message: "one" }));
  store.dispatch(pushErrorDialog({ title: "Second", message: "two" }));

  expect(store.getState().errorDialog.value.current.title).toBe("First");
  expect(store.getState().errorDialog.value.queue).toHaveLength(1);

  store.dispatch(dismissErrorDialog());

  expect(store.getState().errorDialog.value.current.title).toBe("Second");
  expect(store.getState().errorDialog.value.queue).toEqual([]);
});
