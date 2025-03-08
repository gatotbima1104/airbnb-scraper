//@ts-nocheck
import fs from "fs";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { Browser, Page } from "puppeteer";
import { setTimeout } from "timers/promises";
import { getRandom } from "random-useragent";
import { rl, askQuestion, smoothScrollToBottom, ensureUSD, scrapingUrl, saveToCsv} from "./helpers";
import { createObjectCsvStringifier } from "csv-writer";
import { Parser as Json2CsvParser } from "json2csv"; // Importing the json2csv parser

puppeteer.use(StealthPlugin());

(async () => {
  try {
    // Get user input for region
    const region = await askQuestion("Enter the region you want to search: ");
    rl.close();

    const sanitizedRegion = region.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");

    // open browser
    const browser: Browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: [`--no-sandbox`],
      ignoreDefaultArgs: ["--enable-automation"],
    });
    const page: Page = await browser.newPage();
    await page.goto("https://www.airbnb.com/", {
      waitUntil: ["load", "domcontentloaded"],
    });
    await setTimeout(500);

    const inputSearchSelector = 'input[id="bigsearch-query-location-input"]';
    const buttonSubmitSelector = 'div.snd2ne0.atm_am_12336oc.atm_gz_yjp0fh.atm_ll_rdoju8.atm_mk_h2mmj6.atm_wq_qfx8er.dir.dir-ltr > button';

    await page.waitForSelector(inputSearchSelector, {visible: true})
    await page.focus(inputSearchSelector);
    await page.type(inputSearchSelector, region, { delay: 100 });
    await setTimeout(500);
    await page.click(buttonSubmitSelector),
    await setTimeout(2000);

    const firstListingSelector = "div.c4mnd7m.atm_9s_11p5wf0.atm_dz_1osqo2v.dir.dir-ltr a";
    await page.waitForSelector(firstListingSelector, {visible: true})

    let pageNumber = 1;
    const urlsScraped: string[] = []

    while (true) {
      await page.waitForSelector(firstListingSelector, { visible: true });

      // Scrape the current page
      console.log(`Scraping page ${pageNumber}...`);
      const result = await scrapingUrl(page);

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
      await setTimeout(1000);
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
      urlsScraped.push(result)
    }

    // save and read from JSON
    // fs.writeFileSync(`./output_data/links.json`, JSON.stringify(urlsScraped, null, 2), "utf8");
    // const urlLinks: string[][] = JSON.parse(fs.readFileSync("./output_data/links.json", 'utf8'))
    // const finalLinks: string[] = urlLinks.flat()
    
    const finalLinks: string[] = urlsScraped.flat()
    console.log(finalLinks)
    const scrapedData = []
    let index: number = 1

    for(let url of finalLinks){
      console.log(`scraping item : ${index}`)
      const urlUsd = ensureUSD(url)
      
      // add retry for avoiding navigation error
      let retries = 3;
      let success = false;

      while (retries > 0 && !success) {
          try {
              await page.goto(urlUsd, { waitUntil: ["load", "domcontentloaded"] });
              await setTimeout(500);
              success = true;
          } catch (error) {
              console.error(`Error navigating to ${urlUsd}. Retries left: ${retries - 1}`);
              retries--;

              if (retries === 0) {
                  console.error(`Skipping ${urlUsd} after 3 failed attempts.`);
                  continue;
              }
          }
      }

      if (!success) {
          index++;
          continue; // Skip to the next URL if all retries failed
      }

        try {
          await page.waitForSelector('div._1k1ce2w > div > div > span > div > span._hb913q', { visible: true, timeout: 5000 });
        } catch (error) {
            console.warn("⚠️ Warning: Selector not found, continuing execution...");
        }

      const detailsPage = await page.evaluate((currUrl) => {
        const getText = (selector) => {
            const el = document.querySelector(selector);
            return el ? el.textContent.trim() : "";
        };

        const getTextMore = (selectors) => {
          for (const selector of selectors) {
              const el = document.querySelector(selector);
              if (el && el.textContent.trim()) {
                  return el.textContent.trim(); // Return immediately if found
              }
          }
          return "";
        };
    
        const getFee = (feeType) => {
            const feeElements = document.querySelectorAll("div._14omvfj");
            for (let el of feeElements) {
                if (el.textContent.includes(feeType)) {
                    const priceEl = el.querySelector("span._1k4xcdh");
                    return priceEl ? priceEl.textContent.trim() : "";
                }
            }
            return "";
        };

        const getTextNumbers = (selector) => {
          const el = document.querySelector(selector);
          if (el && el.textContent.trim()) {
              const match = el.textContent.trim().match(/\d+/); // Extracts only numbers
              return match ? match[0] : ""; // Returns the first matched number
          }
          return "";
        };

        const getScriptData = (id) => {
          const scriptEl = document.querySelector(`script#${id}`);
            return scriptEl ? scriptEl.textContent.trim() : null;
        };
    
        let jsonData = {};
        const scriptContent = getScriptData("data-deferred-state-0");
    
        if (scriptContent) {
            try {
                jsonData = JSON.parse(scriptContent);
            } catch (error) {
                console.error("Failed to parse JSON from script:", error);
            }
        }

        // Extract sections properly
        const sections = jsonData?.niobeMinimalClientData?.[0]?.[1]?.data?.presentation?.stayProductDetailPage?.sections?.sections || [];

        // Function to find section data
        const findSection = (type) => sections.find(section => section.sectionComponentType === type)?.section || {};
        const locationData = findSection("LOCATION_PDP");
        const reviewData = findSection("REVIEWS_DEFAULT");
  
        return {
            // APIS
            url: currUrl,
            name: findSection("TITLE_DEFAULT")?.title || "",
            region: locationData?.subtitle || "",
            id: currUrl.split("rooms/")[1].split('?search')[0],
            description: findSection("DESCRIPTION_DEFAULT")?.htmlDescription?.htmlText?.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() || "",
            rating: getTextMore(['div[data-testid="pdp-reviews-highlight-banner-host-rating"] > div[aria-hidden="true"]', 'div.gvcwa6y.atm_h3_12gsa0d.atm_fr_12gsa0d.atm_7l_dezgoh.atm_c8_t9kd1m.atm_g3_t9kd1m.atm_h3_1n1ank9__uwn79d.atm_c8_12am3vd__uwn79d.atm_g3_12am3vd__uwn79d.atm_h3_1bs0ed2__oggzyc.atm_c8_12xxubj__oggzyc.atm_g3_12xxubj__oggzyc.dir.dir-ltr > h2 > div', 'div.r1lutz1s.atm_c8_o7aogt.atm_c8_l52nlx__oggzyc.dir.dir-ltr']),
            cleanliness: findSection("REVIEWS_DEFAULT")?.ratings?.find(r => r.categoryType === "CLEANLINESS")?.localizedRating || "",
            accuracy: findSection("REVIEWS_DEFAULT")?.ratings?.find(r => r.categoryType === "ACCURACY")?.localizedRating || "",
            check_in: findSection("REVIEWS_DEFAULT")?.ratings?.find(r => r.categoryType === "CHECKIN")?.localizedRating || "",
            communication: findSection("REVIEWS_DEFAULT")?.ratings?.find(r => r.categoryType === "COMMUNICATION")?.localizedRating || "",
            guestSatisfaction: reviewData?.overallRating || "",
            location: findSection("REVIEWS_DEFAULT")?.ratings?.find(r => r.categoryType === "LOCATION")?.localizedRating || "",
            value: findSection("REVIEWS_DEFAULT")?.ratings?.find(r => r.categoryType === "VALUE")?.localizedRating || "",
            reviewCount: findSection("REVIEWS_DEFAULT")?.overallCount || "",
            priceQualifier: getText('div._ati8ih span.a8jt5op').replace(" per night", ""),
            cleaningFee: getFee("Cleaning fee"),
            serviceFee: getFee("Airbnb service fee"),
            price: getText("div._1avmy66 > span._1qs94rc > span > span"),
            latitude: locationData?.lat || "",
            longitude: locationData?.lng || ""
        };
      }, url);

      scrapedData.push(detailsPage);
      await setTimeout(500)
      index++
    }

    await saveToCsv(scrapedData, sanitizedRegion)
    await browser.close();
  } catch (error) {
    console.error("Error:", error);
  }
})();
