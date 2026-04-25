/**
 * Config plugin — sets android:exported="false" on UCropActivity.
 *
 * expo-image-picker uses the ucrop library which declares UCropActivity
 * with exported=true by default. This allows other apps to launch the
 * crop UI directly, which MobSF flags as a HIGH finding. Setting it to
 * false restricts the activity to our app only.
 */

const { withAndroidManifest } = require("@expo/config-plugins");

const UCROP_ACTIVITIES = [
  "com.yalantis.ucrop.UCropActivity",
  "com.yalantis.ucrop.UCropSupportActivity",
];

module.exports = function withUCropActivity(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    const application = manifest.manifest.application?.[0];

    if (!application) {
      console.warn("[withUCropActivity] No <application> node found");
      return cfg;
    }

    application.activity = application.activity ?? [];

    for (const activityName of UCROP_ACTIVITIES) {
      const existing = application.activity.find(
        (a) => a.$?.["android:name"] === activityName
      );

      if (existing) {
        existing.$["android:exported"] = "false";
        console.log(`[withUCropActivity] Set exported=false on existing ${activityName}`);
      } else {
        application.activity.push({
          $: {
            "android:name": activityName,
            "android:exported": "false",
          },
        });
        console.log(`[withUCropActivity] Inserted ${activityName} with exported=false`);
      }
    }

    return cfg;
  });
};
