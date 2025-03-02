//@ts-nocheck
import { Browser, Page } from "puppeteer";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { setTimeout } from "timers/promises";
import { getRandom } from "random-useragent";
import { scrapingHotels } from "./helpers/scraping";
import fs from "fs";
import { createObjectCsvStringifier } from "csv-writer";
import readline from "readline";

puppeteer.use(StealthPlugin());

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Function to get user input
const askQuestion = (query) => {
  return new Promise((resolve) => rl.question(query, resolve));
};

(async () => {
  try {
    // Get user input for region
    const region = await askQuestion("Enter the region you want to search: ");
    rl.close();

    // Sanitize region to be used as a filename (replace spaces with underscores)
    const sanitizedRegion = region.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");

    // Define CSV file path dynamically
    const csvPath = `output_data/scraped_hotels_${sanitizedRegion}.csv`;

    // Create a writable stream
    const writeStream = fs.createWriteStream(csvPath, { flags: "a" });

    // Create CSV stringifier
    const csvStringifier = createObjectCsvStringifier({
      header: [
        { id: "link", title: "URL" },
        { id: "name", title: "Hotel Name" },
        { id: "region", title: "Region" },
      ],
    });

    // Write headers only if the file is empty
    if (!fs.existsSync(csvPath) || fs.statSync(csvPath).size === 0) {
      writeStream.write(csvStringifier.getHeaderString());
    }

    const browser: Browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: [`--no-sandbox`],
      ignoreDefaultArgs: ["--enable-automation"],
    });

    const page: Page = await browser.newPage();
    const userAgent = getRandom();
    await page.setUserAgent(userAgent);

    await page.goto("https://www.airbnb.com/", {
      waitUntil: ["load", "domcontentloaded", "networkidle0", "networkidle2"],
    });

    await setTimeout(2000);

    // const searchSelector = "span.ieg7dag.atm_j3_1osqo2v.atm_9s_1n7usvw.atm_h_1h6ojuz.atm_dz_13ngjxv.dir.dir-ltr > button:nth-child(1)";
    const inputSearchSelector = 'input[id="bigsearch-query-location-input"]';
    const buttonSubmitSelector = 'div.snd2ne0.atm_am_12336oc.atm_gz_yjp0fh.atm_ll_rdoju8.atm_mk_h2mmj6.atm_wq_qfx8er.dir.dir-ltr > button';

    // await page.waitForSelector(searchSelector, { visible: true });
    await page.focus(inputSearchSelector);
    await page.type(inputSearchSelector, region, { delay: 100 });
    await setTimeout(1000);

    await page.click(buttonSubmitSelector),
    await setTimeout(5000);


    // const [response] = await Promise.all([
    //   page.waitForNavigation(),
    //   page.click(buttonSubmitSelector),
    // ]);

    const firstListingSelector = "div.c4mnd7m.atm_9s_11p5wf0.atm_dz_1osqo2v.dir.dir-ltr a";

    let pageNumber = 1;
    while (true) {
      await page.waitForSelector(firstListingSelector, { visible: true });

      // Scrape the current page
      console.log(`Scraping page ${pageNumber}...`);
      const result = await scrapingHotels(page);

      // Save results to CSV immediately
      if (result.length > 0) {
        writeStream.write(csvStringifier.stringifyRecords(result));
        console.log(`Saved ${result.length} records to ${csvPath}.`);
      }

      // Check if the "Next" button exists and is enabled
      const nextBtn = await page.$('a[aria-label="Next"]');
      if (!nextBtn) {
        console.log("No more pages to scrape.");
        break;
      }

      const isDisabled = await page.evaluate((btn) => btn.hasAttribute("disabled"), nextBtn);
      if (isDisabled) {
        console.log("Next button is disabled, stopping.");
        break;
      }

      // Store the first listing's href before clicking "Next"
      const firstListingBefore = await page.evaluate((selector) => {
        const firstElement = document.querySelector(selector);
        return firstElement ? firstElement.href : null;
      }, firstListingSelector);

      await nextBtn.click();
      await setTimeout(5000);
      await page.waitForFunction(
        (selector, oldHref) => {
          const newFirst = document.querySelector(selector);
          return newFirst && newFirst.href !== oldHref;
        },
        {},
        firstListingSelector,
        firstListingBefore
      );

      pageNumber++;
    }

    await browser.close();
    writeStream.end(); // Close the stream
  } catch (error) {
    console.error("Error:", error);
  }
})();
