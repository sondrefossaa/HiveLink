# Ad Setup Guide

This guide explains how to set up real ads for HiveLink.

## Banner Ads (Google AdSense)

Banner ads are already integrated and will work once you configure AdSense.

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

Rewarded video ads require a provider that supports web. Here are your options:

### Option 1: Unity Ads (Recommended for Web)

Unity Ads has excellent web support for rewarded video ads.

#### Setup Steps:

1. **Sign up for Unity Ads**
   - Go to https://operate.dashboard.unity3d.com
   - Create an account
   - Create a new project
   - Get your Game ID

2. **Create Rewarded Video Ad Units**
   - In Unity Ads dashboard, create rewarded video ad units
   - Get the Zone ID for each reward type

3. **Add to Environment Variables**
   ```env
   NEXT_PUBLIC_UNITY_ADS_GAME_ID="1234567"
   NEXT_PUBLIC_UNITY_ADS_ZONE_ID="Rewarded_Android"  # or your zone ID
   ```

4. **The code will automatically use Unity Ads** when these variables are set.

### Option 2: Google Ad Manager

Google Ad Manager supports rewarded video ads but requires more setup.

#### Setup Steps:

1. **Sign up for Google Ad Manager**
   - Go to https://admanager.google.com
   - Create an account
   - Get your Network Code

2. **Create Rewarded Video Ad Units**
   - Create rewarded video ad units in Ad Manager
   - Get the ad unit path (format: `/network-code/ad-unit-path`)

3. **Add to Environment Variables**
   ```env
   NEXT_PUBLIC_GOOGLE_AD_MANAGER_NETWORK_CODE="123456789"
   NEXT_PUBLIC_GOOGLE_AD_MANAGER_AD_UNIT_PATH="/123456789/rewarded-video"
   ```

### Option 3: Google AdMob (Mobile Apps)

AdMob is primarily for mobile apps, but can work with web in some cases.

#### Setup Steps:

1. **Sign up for AdMob**
   - Go to https://admob.google.com
   - Create an account
   - Create a rewarded ad unit

2. **Add to Environment Variables**
   ```env
   NEXT_PUBLIC_ADMOB_APP_ID="ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX"
   ```

3. **Note**: AdMob requires additional SDK setup and is better suited for mobile apps.

## Testing Real Ads

To test real ads in development:

1. Set `NEXT_PUBLIC_USE_REAL_ADS=true` in your `.env` file
2. Configure one of the ad providers above
3. The app will use real ads instead of mocks

## Production Checklist

- [ ] Google AdSense account approved
- [ ] AdSense Publisher ID configured
- [ ] Ad units created in AdSense
- [ ] Rewarded video ad provider configured (Unity Ads, Ad Manager, or AdMob)
- [ ] Environment variables set in production (Vercel, etc.)
- [ ] Test ads in production environment
- [ ] Monitor ad performance in provider dashboards

## Ad Provider Priority

The system tries providers in this order:
1. Unity Ads (if configured)
2. Google Ad Manager (if configured)
3. AdMob (if configured)
4. Mock ads (fallback)

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

