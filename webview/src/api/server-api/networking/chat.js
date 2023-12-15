import { _fetch } from "./fetch";
import { getAPIEndpoints } from "./index";

export async function postChat(
  query,
  prevMessages,
  useDocuments,
  model,
  temperature,
  accessToken
) {
  return _fetch(getAPIEndpoints().CHAT, {
    method: "POST",
    body: {
      query,
      prevMessages,
      useDocuments,
      model,
      temperature,
      accessToken,
    },
  });
}
