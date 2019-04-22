import uuid from "uuid";
import assert from "assert";
import { createBrowser, createReportWithBrowser } from "./lighthouse-util.js";
import { getStore } from "./store";
import { getQueue } from "./schedule";

const reportGenerationQueue = getQueue("report-generation");

reportGenerationQueue.process(doReportWork);

async function doReportWork(job) {
  const payload = job.data;

  if (!(payload && payload.id && payload.url)) {
    console.warn("doReportWork received invalid payload", payload);
    return job.moveToFailed("Invalid payload");
  }
  
  const browser = await createBrowser();  

  const result = await createReportWithBrowser(
    browser,
    payload.url,
    payload.options || { output: "html" }
  );

  await browser.close();

  // Save our result ready to be retrieved by the client
  console.log(`Saving report for ${payload.id}`);

  const document = Object.assign({}, payload, {
    result
  });

  const store = await getStore();
  await store.set(payload.id, JSON.stringify(document));
}

export async function requestGenerateReport(url, options = { output: "html" }) {
  const id = `report:${uuid.v4()}`;
  // Notice the use of JSON.stringify, levelup will accept Buffers or strings, so we want
  // to use JSON for our value
  const document = {
    id,
    url,
    options
  };
  const store = await getStore();
  await store.set(id, JSON.stringify(document));
  await reportGenerationQueue.add(document, {
    removeOnComplete: true,
    removeOnFail: true // We have no way to handle this atm 
  });
  return id;
}