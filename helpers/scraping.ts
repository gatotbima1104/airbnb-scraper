import { Page } from "puppeteer";

export const scrapingHotels = async (page: Page) => {
  try {
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

        return {
          link: fullUrl? fullUrl : "",
          name: name? name : "",
          region: result? result : "",
        };
      });
    });

    return pageData;
  } catch (error) {
    console.log(error);
  }
};
