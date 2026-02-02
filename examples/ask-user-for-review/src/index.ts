import { inMemoryCommander } from "@mission-control/commander";
import { askForReviewMission } from "./mission-definition.ts";

const myFirstMission = inMemoryCommander.createMission(askForReviewMission);

myFirstMission.startMission({
	email: "hello world!",
});

setTimeout(() => {
	myFirstMission.signal("receive-review", "This is my review!");
}, 100);
