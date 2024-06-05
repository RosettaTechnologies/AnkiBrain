import { store } from "./redux";
import {
  setLLMProvider as setProvider,
  setLLMModel as setLLM,
  setTemperature as setTemp,
} from "./redux/slices/appSettings";
import { pyEditSetting } from "./PythonBridge/senders/pyEditSetting";

export async function setLLMProvider(providerName, dispatch = store.dispatch) {
  dispatch(setProvider(providerName))
  await pyEditSetting("llmProvider", providerName)
}

export async function setLLMModel(modelName, dispatch = store.dispatch) {
  dispatch(setLLM(modelName));
  await pyEditSetting("llmModel", modelName);
}

export async function setTemperature(temperature, dispatch = store.dispatch) {
  dispatch(setTemp(temperature));
  await pyEditSetting("temperature", temperature);
}
