// cypress/support/helpers/dataFactory.js
//
// Central faker-backed factory for demo-safe, randomized test data. Keeping the
// generators in one place means specs never embed real inventory records and
// every run exercises fresh values. All names carry a short prefix + timestamp
// so created resources are easy to identify and clean up.

import { faker } from '@faker-js/faker';

const stamp = () => `${Date.now()}-${faker.number.int({ min: 100, max: 9999 })}`;

/** Collision-resistant, human-readable unique name, e.g. "Cat-widget-172...-4821". */
export const uniqueName = (prefix = 'Auto') => `${prefix}-${faker.word.noun()}-${stamp()}`;

/** A disposable category name. */
export const randomCategory = (prefix = 'Cat') => uniqueName(prefix);

/** A disposable PO number, e.g. "PO-AUTO-8F3K-4821". */
export const randomPo = () =>
  `PO-AUTO-${faker.string.alphanumeric({ length: 4, casing: 'upper' })}-${faker.number.int({ min: 1000, max: 9999 })}`;

/** A pseudo serial number, e.g. "SN-9F2A7C41". */
export const randomSerial = () => `SN-${faker.string.alphanumeric({ length: 8, casing: 'upper' })}`;

/** A product-detail bundle (make/model/quantity/cost/price) with realistic ranges. */
export const randomProduct = () => {
  const cost = faker.number.int({ min: 20, max: 500 });
  return {
    make: faker.company.name(),
    model: `${faker.string.alpha({ length: 3, casing: 'upper' })}-${faker.number.int({ min: 100, max: 999 })}`,
    quantity: faker.number.int({ min: 1, max: 100 }),
    cost,
    price: cost + faker.number.int({ min: 5, max: 200 }), // price above cost
  };
};

/** A work-order number, e.g. "WO-AUTO-4821". */
export const randomWorkOrder = () => `WO-AUTO-${faker.number.int({ min: 1000, max: 9999 })}`;

export default {
  uniqueName,
  randomCategory,
  randomPo,
  randomSerial,
  randomProduct,
  randomWorkOrder,
};
