# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

## Inventory Module

Inventory screens are available at:

- `/inventory/dashboard`
- `/inventory/places`
- `/inventory/products`
- `/inventory/stocks`
- `/inventory/daily-checklist`
- `/inventory/alerts`

### Environment variables

- `EXPO_PUBLIC_API_BASE_URL`: Main backend base URL (the app normalizes this to include `/api`)
- `EXPO_PUBLIC_INVENTORY_API_BASE_URL` (optional): Full inventory API base URL.  
  Example: `https://your-domain.com/api/inventory`  
  If omitted, app uses `${EXPO_PUBLIC_API_BASE_URL}/api/inventory`.

### Inventory flow

1. Dashboard summarizes active places/products, checklist progress, and open alerts.
2. Places and Products manage inventory entities.
3. Stocks updates current quantities per place/product.
4. Daily Checklist opens today checklist, counts items, and submits.
5. Alerts lists low-stock/refill alerts with ack/resolve actions.

All inventory server state is managed with React Query via typed hooks in `hooks/inventory/*` and typed API client methods in `services/inventoryApi.ts`.

### Daily checklist + transfer behavior

- Screen route: `/inventory/daily-checklist`
- On load, app fetches `GET /api/inventory/checklists/today` (optional `date`).
- If no checklist exists for the selected date, user can start one with `POST /api/inventory/checklists/daily/open`.
- Checklist rows are grouped by place and support row-level save using:
  - `PATCH /api/inventory/checklists/:checklistId/items/:itemId`
- Each row supports stock move through transfer modal:
  - `POST /api/inventory/stocks/transfer`
  - Product is fixed to row product, destination is row place, source place is selected by user.
  - Source stock preview uses `GET /api/inventory/stocks?placeId=...`.
- Submit uses `POST /api/inventory/checklists/:checklistId/submit` and is blocked while pending rows (without counted quantity) exist.
- After row updates, transfers, and submit, checklist/stocks/dashboard/alerts queries are invalidated to avoid stale UI.
