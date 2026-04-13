import { createCommander } from "@mission-control/core";
import { askForReviewMission } from "./mission-definition.ts";

const commander = createCommander({
	definitions: [askForReviewMission],
});
const myFirstMission = await commander.start(askForReviewMission, {
	email: "hello@example.com",
});

setTimeout(() => {
	void myFirstMission.signal("receive-review", "This is my review!");
}, 100);

await myFirstMission.waitForCompletion();
console.log(myFirstMission.inspect());
