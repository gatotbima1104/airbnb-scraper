//@ts-nocheck

import { Page } from "puppeteer";
import readline from "readline";
import fs from "fs";
import { Parser as Json2CsvParser } from "json2csv"; // Importing the json2csv parser

// sleep
export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Scroll to bottom
export async function smoothScrollToBottom(page: Page) {
  await page.evaluate(() => {
    return new Promise<void>((resolve) => {
      let totalHeight = 0;
      const distance = 100; // Scroll step in pixels
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight - window.innerHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 20); // Scroll every 50ms for smooth effect
    });
  });
}

// make sure price is $$
export const ensureUSD = (url: string) => {
  // If the URL already includes a currency parameter, leave it unchanged
  if (url.includes("currency=")) return url;
  // Append currency=USD. Use ? if no query string exists; otherwise, use &
  return url.includes("?") ? `${url}&currency=USD` : `${url}?currency=USD`;
};

// scraping url each hotel
export const scrapingUrl = async (page: Page) => {
  try {
    await page.waitForSelector("div.c4mnd7m.atm_9s_11p5wf0.atm_dz_1osqo2v.dir.dir-ltr", {visible: true})
    const pageData = await page.evaluate(() => {
      const data = document.querySelectorAll(
        "div.c4mnd7m.atm_9s_11p5wf0.atm_dz_1osqo2v.dir.dir-ltr"
      );
      let region = document.title;
      let result = region.split("| ")[1].split(" -")[0];

      return Array.from(data).map((el) => {
        const link = el
          .querySelector('meta[itemprop="url"]')
          ?.getAttribute("content");
        const name = el
          .querySelector('meta[itemprop="name"]')
          ?.getAttribute("content");

        const fullUrl = "https://" + link;
        const id = link?.split("/rooms/")[1].split("?search")[0]

        // return {
        //   link: fullUrl? fullUrl : "",
        //   name: name? name : "",
        //   region: result? result : "",
        //   id,
        // };
        return fullUrl? fullUrl : ""
      });
    });

    return pageData;
  } catch (error) {
    console.log(error);
  }
};

// terminal
export const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Function to get user input
export const askQuestion = (query: string) => {
  return new Promise((resolve) => rl.question(query, resolve));
};

export const saveToCsv = (scrapedData: any, sanitizedRegion: any) => {
  // Ensure output_data directory exists
  const outputDir = "./output_data";
  if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
  }

  // Convert scraped data to CSV
  const json2csvParser = new Json2CsvParser({ fields: Object.keys(scrapedData[0] || {}) });
  const csv = json2csvParser.parse(scrapedData);

  // Write to CSV file
  const csvFilePath = `${outputDir}/Hotel_${sanitizedRegion}.csv`;
  // const csvFilePath = `${outputDir}/Hotels_${sanitizedRegion}.csv`;
  fs.writeFileSync(csvFilePath, csv, "utf8");
  console.log(`Data successfully saved to ${csvFilePath}`);
}