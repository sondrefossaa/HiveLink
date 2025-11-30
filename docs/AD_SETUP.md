# Ad Setup Guide - Google Ads Only

This guide explains how to set up Google Ads for HiveLink. All ads use Google's ad network, which works on both browser and mobile web.

## Banner Ads (Google AdSense)

Banner ads use Google AdSense and work on both desktop browsers and mobile web.

### Setup Steps:

1. **Sign up for Google AdSense**
   - Go to https://www.google.com/adsense
   - Create an account and get approved
   - Get your Publisher ID (format: `ca-pub-XXXXXXXXXXXXXXXX`)

2. **Add to Environment Variables**
   ```env
   NEXT_PUBLIC_GOOGLE_ADSENSE_ID="ca-pub-XXXXXXXXXXXXXXXX"
   ```

3. **Create Ad Units in AdSense**
   - Go to AdSense dashboard → Ads → By ad unit
   - Create a new ad unit
   - Copy the ad slot ID (format: `1234567890`)
   - Use this in your `AdBanner` component

4. **Usage**
   ```tsx
   <AdBanner adSlot="1234567890" />
   ```

## Rewarded Video Ads

Rewarded video ads use Google Ad Manager (recommended) or Google AdMob. Both work on browser and mobile web.

### Option 1: Google Ad Manager (Recommended)

**Yes, Google Ad Manager supports rewarded video ads and they work on both desktop browsers and mobile web browsers.**

Google Ad Manager is the best option for web rewarded video ads. It works on:
- ✅ Desktop browsers (Chrome, Firefox, Safari, Edge)
- ✅ Mobile web browsers (Safari on iOS, Chrome on Android, etc.)
- ✅ All devices that can access your web app

#### Setup Steps:

1. **Sign up for Google Ad Manager**
   - Go to https://admanager.google.com
   - Create an account
   - Get your Network Code

2. **Create Rewarded Video Ad Units**
   - In Ad Manager dashboard, create a new ad unit
   - Select "Rewarded video" as the ad format
   - Configure the reward type and amount (e.g., "hint", "extra practice")
   - Get the ad unit path (format: `/network-code/ad-unit-path`)

3. **Add to Environment Variables**
   ```env
   NEXT_PUBLIC_GOOGLE_AD_MANAGER_NETWORK_CODE="123456789"
   NEXT_PUBLIC_GOOGLE_AD_MANAGER_AD_UNIT_PATH="/123456789/rewarded-video"
   ```

**Note**: The same implementation works on both desktop and mobile - no separate setup needed for mobile devices.

### Option 2: Google AdMob

AdMob can work on both mobile web and desktop browsers, but requires additional SDK setup.

#### Setup Steps:

1. **Sign up for Google AdMob**
   - Go to https://admob.google.com
   - Create an account
   - Create a new app (select "Web" as platform)
   - Get your App ID (format: `ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX`)

2. **Create Rewarded Video Ad Units**
   - Create rewarded video ad units in AdMob dashboard
   - Get the Ad Unit ID (format: `ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX`)

3. **Add to Environment Variables**
   ```env
   NEXT_PUBLIC_ADMOB_APP_ID="ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX"
   NEXT_PUBLIC_ADMOB_AD_UNIT_ID="ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX"
   ```

4. **Note**: AdMob web integration requires loading the Google Mobile Ads SDK. For easier setup, use Google Ad Manager instead.

## Testing Real Ads

To test real ads in development:

1. Set `NEXT_PUBLIC_USE_REAL_ADS=true` in your `.env` file
2. Configure one of the ad providers above
3. The app will use real ads instead of mocks

## Production Checklist

- [ ] Google AdSense account approved
- [ ] AdSense Publisher ID configured
- [ ] Ad units created in AdSense
- [ ] Rewarded video ad provider configured (Google Ad Manager or AdMob)
- [ ] Environment variables set in production (Vercel, etc.)
- [ ] Test ads in production environment
- [ ] Monitor ad performance in provider dashboards

## Ad Provider Priority

The system uses Google Ads only and tries providers in this order:
1. **Google Ad Manager** (if configured) - **Best for web, works on desktop browsers AND mobile web browsers**
2. **Google AdMob** (if configured) - Works on mobile web and desktop browsers (requires SDK setup)
3. **Mock ads** (fallback for development)

**Mobile Support**: Google Ad Manager rewarded video ads work on mobile web browsers (Safari on iOS, Chrome on Android, etc.) - no native app required. The same code works on all devices.

## Troubleshooting

### Ads not showing
- Check browser console for errors
- Verify environment variables are set correctly
- Ensure ad units are active in provider dashboard
- Check ad provider account status

### Rewarded video not completing
- Verify ad unit is configured for rewarded video
- Check that callbacks are properly set up
- Review provider documentation for web-specific requirements

## Revenue Optimization Tips

1. **Placement**: Place banner ads in non-intrusive locations
2. **Frequency**: Don't show too many ads - balance user experience
3. **Rewards**: Make rewards valuable enough that users want to watch ads
4. **Testing**: A/B test different ad placements and frequencies
5. **Analytics**: Monitor which rewards are most popular

