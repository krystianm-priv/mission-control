import { inMemoryCommander } from "@mission-control/commander";
import { askForReviewMission } from "./mission-definition.ts";

const myFirstMission = inMemoryCommander.createMission(askForReviewMission);

await myFirstMission.start({
	email: "hello@example.com",
});

setTimeout(() => {
	void myFirstMission.signal("receive-review", "This is my review!");
}, 100);

await myFirstMission.waitForCompletion();
console.log(myFirstMission.inspect());
