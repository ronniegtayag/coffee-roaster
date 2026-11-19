/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument -- supertest bodies are untyped JSON */
import request from 'supertest';
import { createUser, login, LoggedIn, TestApp } from './app';

export const api = '/api/v1';

export interface Actors {
  admin: LoggedIn;
  manager: LoggedIn;
  staff: LoggedIn;
}

/** One user per role, logged in. */
export async function loginActors(t: TestApp): Promise<Actors> {
  await createUser(t, { email: 'admin@example.com', role: 'ADMIN' });
  await createUser(t, { email: 'manager@example.com', role: 'MANAGER' });
  await createUser(t, { email: 'staff@example.com', role: 'STAFF' });
  return {
    admin: await login(t, 'admin@example.com'),
    manager: await login(t, 'manager@example.com'),
    staff: await login(t, 'staff@example.com'),
  };
}

export function client(t: TestApp) {
  const call =
    (method: 'get' | 'post' | 'patch' | 'put' | 'delete') =>
    (url: string, who: LoggedIn, body?: object) => {
      const req = request(t.server)[method](`${api}${url}`).set(who.auth);
      return body === undefined ? req : req.send(body);
    };
  return {
    get: call('get'),
    post: call('post'),
    patch: call('patch'),
    put: call('put'),
    del: call('delete'),
  };
}

export type Client = ReturnType<typeof client>;

let counter = 0;
export const uniq = (prefix: string) => `${prefix}-${++counter}`;

export interface Catalogue {
  coffeeId: string;
  grinds: Record<string, string>;
  espresso1kg: { id: string; price: string };
  espresso250g: { id: string; price: string };
  tablets: { id: string; price: string };
}

/** House Espresso 1 kg whole bean $34.00 GST-free, 250 g $11.50, Cleaning tablets $18.18 GST. */
export async function seedCatalogue(c: Client, who: LoggedIn): Promise<Catalogue> {
  const grindsRes = await c.get('/grinds', who);
  const grinds: Record<string, string> = {};
  for (const g of grindsRes.body.items) grinds[g.name] = g.id;
  const coffee = (await c.post('/coffees', who, { name: 'House Espresso', type: 'BLEND' })).body;
  const make = async (body: object) => {
    const res = await c.post('/products', who, body);
    if (res.status !== 201) throw new Error(`product create failed ${JSON.stringify(res.body)}`);
    return { id: res.body.id as string, price: res.body.listPriceExGst as string };
  };
  return {
    coffeeId: coffee.id,
    grinds,
    espresso1kg: await make({
      sku: 'HE-1KG-WB',
      coffeeId: coffee.id,
      bagSizeGrams: 1000,
      grindId: grinds['Whole bean'],
      listPriceExGst: '34.00',
      taxCode: 'GST_FREE',
    }),
    espresso250g: await make({
      sku: 'HE-250-WB',
      coffeeId: coffee.id,
      bagSizeGrams: 250,
      grindId: grinds['Whole bean'],
      listPriceExGst: '11.50',
      taxCode: 'GST_FREE',
    }),
    tablets: await make({
      sku: 'CT-100',
      name: 'Cleaning tablets',
      listPriceExGst: '18.18',
      taxCode: 'GST',
    }),
  };
}

export async function seedBranch(c: Client, who: LoggedIn, name = 'Bean There') {
  const customer = (
    await c.post('/customers', who, {
      legalName: `${name} Pty Ltd`,
      tradingName: name,
      billingEmail: 'ap@x.com',
    })
  ).body;
  const branch = (
    await c.post(`/customers/${customer.id}/branches`, who, {
      name: `${name} Surry Hills`,
      addressLine1: '1 Crown St',
      suburb: 'Surry Hills',
      state: 'NSW',
      postcode: '2010',
    })
  ).body;
  return { customerId: customer.id as string, branchId: branch.id as string };
}

export const newRequestId = () => crypto.randomUUID();
