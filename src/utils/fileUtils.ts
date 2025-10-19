export const formatFileSize = (bytes: number): string => {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    return `${gb.toFixed(2)} GB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
};

export const calculatePrice = (bytes: number): number => {
  const mb = bytes / (1024 * 1024);

  if (mb <= 50) return 0.99;
  if (mb <= 100) return 1.49;
  if (mb <= 250) return 2.49;
  if (mb <= 500) return 3.99;
  return 5.99;
};

const PRODUCT_IDS = {
  up_to_50mb: 'price_1RTqi1QAyzvYrAEbOPfKbazQ',
  up_to_100mb: 'price_1RTqjWQAyzvYrAEbPC1I9PvY',
  up_to_250mb: 'price_1RTqk1QAyzvYrAEbgOnszbaP',
  up_to_500mb: 'price_1RTqkWQAyzvYrAEb5gyeHjD4',
  above_500mb: 'price_1RTqkyQAyzvYrAEbUDTTsAmp'
} as const;

export const getProductId = (sizeInBytes: number): string => {
  const sizeInMB = sizeInBytes / (1024 * 1024);

  if (sizeInMB <= 50) return PRODUCT_IDS.up_to_50mb;
  if (sizeInMB <= 100) return PRODUCT_IDS.up_to_100mb;
  if (sizeInMB <= 250) return PRODUCT_IDS.up_to_250mb;
  if (sizeInMB <= 500) return PRODUCT_IDS.up_to_500mb;
  return PRODUCT_IDS.above_500mb;
}; 