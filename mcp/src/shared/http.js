// selaras dengan curl/Postman dari stockbit.com
export const BROWSERISH_HEADERS = {
  Accept: 'application/json',
  'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8,id;q=0.7',
  'Cache-Control': 'no-cache',
  'Content-Type': 'application/json',
  Origin: 'https://stockbit.com',
  Pragma: 'no-cache',
  Priority: 'u=1, i',
  Referer: 'https://stockbit.com/',
  'Sec-CH-UA':
    '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
  'Sec-CH-UA-Mobile': '?0',
  'Sec-CH-UA-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-site',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
};

// GET tanpa body: Stockbit tidak kirim Content-Type di order book
export const BROWSERISH_GET_HEADERS = { ...BROWSERISH_HEADERS };
delete BROWSERISH_GET_HEADERS['Content-Type'];
