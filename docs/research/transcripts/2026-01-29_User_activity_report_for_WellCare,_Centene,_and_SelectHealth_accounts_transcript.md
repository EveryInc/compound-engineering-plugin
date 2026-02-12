---
title: "User activity report for WellCare, Centene, and SelectHealth accounts"
id: faafe8f5-1d43-4979-9d0f-e7c70092d222
created_at: 2026-01-29T18:56:32.272Z
updated_at: 2026-01-29T19:22:41.841Z
source: granola
type: transcript
linked_note: 2026-01-29_User_activity_report_for_WellCare,_Centene,_and_SelectHealth_accounts.md
---
# User activity report for WellCare, Centene, and SelectHealth accounts — Transcript

**You:** **[18:56:32]** Many different systems do you have to log into to find all the right data that you wanna know about your accounts.

**Other:** **[18:56:43]** Oh, no. Are we only talking about data as in no. Okay. Alright. Well, Salesforce,

**You:** **[18:56:59]** Yep.

**Other:** **[18:57:00]** program manager,

**You:** **[18:57:02]** Okay.

**Other:** **[18:57:03]** decision point insights,

**You:** **[18:57:07]** Okay.

**Other:** **[18:57:08]** Jira,

**You:** **[18:57:10]** Yep.

**Other:** **[18:57:14]** Good grief. Hang on. Let's see. I feel like I mean, just Microsoft in general, like SharePoint, Confluence,

**You:** **[18:57:24]** Yeah. Yep.

**Other:** **[18:57:27]** So there's five. Upslow,

**You:** **[18:57:30]** What's that one?

**Other:** **[18:57:30]** Billing. So there's six.

**You:** **[18:57:33]** Okay.

**Other:** **[18:57:38]** Dropbox, seven.

**You:** **[18:57:40]** What's in Dropbox?

**Other:** **[18:57:42]** Analytics garbage.

**You:** **[18:57:46]** Yeah. They had it. I told them. They they've been on that garbage for

**Other:** **[18:57:46]** Not garbage, but yeah.

**You:** **[18:57:50]** a while.

**Other:** **[18:57:52]** Yes. So we're at seven with Dropbox. I mean, SFTP crap. I luckily haven't had to log on there for a bit because they're now starting to do that, but I have access to it.

**You:** **[18:58:08]** Okay.

**Other:** **[18:58:09]** That's eight That's what I can think of. Right now.

**You:** **[18:58:19]** Off the top of your head, pretty good list.

**Other:** **[18:58:20]** Yeah.

**You:** **[18:58:22]** Okay. Cool.

**Other:** **[18:58:22]** Yep.

**You:** **[18:58:25]** Alright. Well, I would love because I feel like I I have not as big of a purview or like I have my focus is narrower, but, yeah, I I feel the same pain at least in my, like, little world of just

**Other:** **[18:58:40]** Yeah.

**You:** **[18:58:42]** focusing on the predict. Folks. And so alright, I have something I wanna show you in a sec, but I am gonna fix this first. Okay. Do you want everyone in WellCare

**Other:** **[18:58:53]** Yes

**You:** **[18:58:56]** Do you want everybody who's active? Or you only want active even if they're think there was one that we made one that was like non care managers or network users.

**Other:** **[18:59:07]** I think we don't just want that. Like, I need to know

**You:** **[18:59:08]** You need everybody.

**Other:** **[18:59:12]** I need everyone that we have, like, licenses for because they're paying other license

**You:** **[18:59:13]** Okay?

**Other:** **[18:59:17]** level.

**You:** **[18:59:17]** Okay. Cool.

**Other:** **[18:59:18]** So whether they're active or not. But I also need to know if they are active because they have asked for who's not using this and who is.

**You:** **[18:59:23]** Got it. Okay. Cool. Who let's do two things. Let me alright. Alright. Role name contains corp. Is active is true. Let's take this role name out.

**Other:** **[18:59:45]** Report another.

**You:** **[18:59:47]** Okay.

**Other:** **[18:59:49]** Sorry. There was one more. Nine. Got you another one.

**You:** **[18:59:57]** Alright. How about this? This is something that's pretty good. The I'll have to take out filter username. Email, we just need to make sure it's not

**Other:** **[19:00:16]** The searching point?

**You:** **[19:00:20]** yeah.

**Other:** **[19:00:21]** Or impulse.

**You:** **[19:00:22]** Email. Visit user user user does not contain decision point or impulse. Okay. Add Enhance. Enhance.

**Other:** **[19:00:46]** Sweet.

**You:** **[19:00:46]** Enhance. Alright. There you go. And then so this here is How can I make the alright? Here, we're gonna I'm gonna save this. And we're gonna call save this as a new question. We're gonna call

**Other:** **[19:01:08]** K.

**You:** **[19:01:13]** active WellCare users all.

**Other:** **[19:01:16]** K.

**You:** **[19:01:17]** All WellCare active, non impulse, Okay. That's one thing. Save. Add this to a dashboard. Ashley. Okay. And I'm gonna take this one out. And then the next thing I'm gonna do is I'm gonna email all this to you, so we don't have to worry about how it looks here.

**Other:** **[19:01:45]** Okay.

**You:** **[19:01:46]** It's just gonna be emailed every time. Let's do another one. Which is Do you want all of this with somebody who's logged in in the last three months.

**Other:** **[19:02:09]** Yeah.

**You:** **[19:02:11]** When is that the good time is that a good time, Mark? Or you want people who have not

**Other:** **[19:02:14]** Yeah. I think that that's fair. We we can start with three months. Well,

**You:** **[19:02:18]** Is it any better? Because, like, it's not

**Other:** **[19:02:21]** the last login, can I

**You:** **[19:02:21]** or both? Yeah. I'm gonna just make another one so that we can just

**Other:** **[19:02:24]** filter by blanks?

**You:** **[19:02:27]** get another XLS so that you don't have to do your own filtering.

**Other:** **[19:02:27]** Okay.

**You:** **[19:02:30]** Unless you whatever. It's you can do your own here, but we could also just make it so that it's

**Other:** **[19:02:34]** Yeah. Okay.

**You:** **[19:02:38]** let me

**Other:** **[19:02:38]** Sure.

**You:** **[19:02:39]** let's just do that. Okay. So editor, do you want

**Other:** **[19:02:45]** Let's do have not.

**You:** **[19:02:45]** people who have or have not logged in? Okay. Last login.

**Other:** **[19:02:54]** Never. Should be never. If you can.

**You:** **[19:03:00]** We can. Exclude oh, is empty. Last login. Exclude. Okay. Save. Wait. Cancel. Okay. 427 people who've never logged in.

**Other:** **[19:03:33]** K.

**You:** **[19:03:36]** And are

**Other:** **[19:03:39]** Okay.

**You:** **[19:03:39]** active.

**Other:** **[19:03:42]** K.

**You:** **[19:03:42]** Okay.

**Other:** **[19:03:44]** Yep. Because then I can go to him and say, what's get rid of these people.

**You:** **[19:03:48]** Yeah. And there yeah. I can't I don't know what they're a little weird because they have the SSO login. So you wanna just they have, like, the provider network user. Do know how that works? For that, like, weird other side of the thing that Brad works with?

**Other:** **[19:04:06]** So yeah. So then in curious because if there's 427 people who are active, And I remember you giving me a list where there was only, like, 47 users, actually.

**You:** **[19:04:19]** Yeah. Yeah. Yeah. That's because it was, like, all people who were not those were only for, like, Sunshine Health. Or Centene I remember there was, like, one Centene Corp one that we, like, tracked all the way down.

**Other:** **[19:04:39]** So I think what I need is I need to know how many users they have registered under their contract, and I don't know how we do that.

**You:** **[19:04:47]** Right.

**Other:** **[19:04:51]** So because they they're only allowed 75, so they

**You:** **[19:04:51]** Well, yeah, we can we can

**Other:** **[19:04:55]** clearly have more than that. But

**You:** **[19:04:56]** One Right. And this is all the whole thing, and they have, like, all the, like, SSO login. There's a whole their whole network team basically logs in to decision point. And some of them, like, only do it, like, once. They're like, I'm going to see doctor so and so Let me print out their reports, and then I'm out. So here's what I'm gonna do. I'm gonna give you all And then I would check with Brad on, like, how we would wanna break it up And I can tell you how some of them let's do let's do this at least. Okay. So we're gonna save This is a new question. It's gonna be called all active users all and never logged in. Okay.

**Other:** **[19:05:50]** k.

**You:** **[19:05:52]** And who have never logged in. Okay. We're gonna add this to dashboard. Okay. I think we should go back to that list. That we made earlier and then we should filter out those ones again because it's Okay. I don't think you want any care managers MEM. Centene,

**Other:** **[19:07:05]** Yes.

**You:** **[19:07:05]** because I think it's you're the you're a corp. Right? Okay.

**Other:** **[19:07:13]** I mean, yes, the specific contract is court.

**You:** **[19:07:18]** Okay. This is the 42 rows. This is the 42 rows.

**Other:** **[19:07:19]** While you're looking at this, okay. Okay.

**You:** **[19:07:24]** So I'm gonna save it as a new one, and this is gonna be

**Other:** **[19:07:25]** Okay. No offense. Centimeters.

**You:** **[19:07:28]** as a new one. All active WellCare's Centene.

**Other:** **[19:07:36]** Okay.

**You:** **[19:07:38]** Okay.

**Other:** **[19:07:44]** One other question for you because so Centene and then SelectHealth is my only other analytics customer.

**You:** **[19:07:51]** Okay.

**Other:** **[19:07:55]** Can I get one for Select? Because

**You:** **[19:07:55]** Yeah.

**Other:** **[19:07:59]** I think they have 40,000 users, and they for new users, I feel like, every single week. We have nothing in the contract that prevents them from doing this. So my goal is to put into their

**You:** **[19:08:15]** Yeah.

**Other:** **[19:08:15]** upcoming renewal No. We're done. We're done with this.

**You:** **[19:08:19]** Or it's really yeah. Or yeah.

**Other:** **[19:08:19]** You can have 50 users.

**You:** **[19:08:22]** Or it's

**Other:** **[19:08:25]** Or they pay a fee of some time to maintain

**You:** **[19:08:25]** yeah. They can tell you that.

**Other:** **[19:08:28]** 40,000 users.

**You:** **[19:08:29]** Yeah. Exactly. Let's let me I can figure this out. But not all active, but I

**Other:** **[19:08:35]** But knowing this information, well,

**You:** **[19:08:36]** corp. Yeah. Yeah. Yeah. I always tell.

**Other:** **[19:08:40]** help me so I can have a conversation with them.

**You:** **[19:08:42]** No. Like, we need it. You're like Do you does this person who's never logged in really need

**Other:** **[19:08:44]** Right.

**You:** **[19:08:47]** Okay. I'm gonna edit this. This is gonna be your Centene tab.

**Other:** **[19:08:47]** Right. And then on top of that, they've been asked for people to get access who already have access, so they don't even know

**You:** **[19:08:55]** Yeah. Yeah. Yeah.

**Other:** **[19:08:59]** who does and doesn't. So I need some sort of report that can tell me.

**You:** **[19:09:00]** Yeah. Yep. Alright. Alright. Edit. Client ID. Client name, client I gotta do ID. Gotta figure out which one it is. Alright. While we're back to philosophizing, what while we're waiting. How do you characterize what is a good account or an account that's like fine versus an account that's in trouble.

**Other:** **[19:10:07]** Good question. So, I mean, I have regular contact with

**You:** **[19:10:16]** Yep.

**Other:** **[19:10:18]** all of my accounts.

**You:** **[19:10:21]** So some of it's a feel.

**Other:** **[19:10:22]** Yeah. So I would know if something was off just by that, but I mean, obviously, if they tell me point blank,

**You:** **[19:10:32]** Right.

**Other:** **[19:10:32]** hey. We're not happy about this. Hey. Whatever. Another one that's easy to identify is if we've recently had a pretty big issue. For them. That

**You:** **[19:10:43]** Like, in a case,

**Other:** **[19:10:44]** yeah.

**You:** **[19:10:44]** Yeah. Yeah. Yeah.

**Other:** **[19:10:46]** Mean, like, for I know your analytics, but a good example of for engagement, I had a customer where we didn't send messages for an entire quarter. And no one no one caught it. The customer caught it.

**You:** **[19:10:57]** No. No one knew. Yeah.

**Other:** **[19:10:59]** So for me, it's like, oh, yep. This is a this is a big risk, folks, because we were done. So that's that's an easy way Silence

**You:** **[19:11:12]** Yeah.

**Other:** **[19:11:12]** if I, like, get on meetings. And there's some customers that just don't talk. Right? They're they're happy and whatever, but I feel like you get on meetings and you're asking them questions and they can't answer questions or they're just really quiet,

**You:** **[19:11:23]** We'll get back to you. Or yeah. I'm not sure.

**Other:** **[19:11:26]** Yeah.

**You:** **[19:11:28]** Oh, we gotta ask him about it.

**Other:** **[19:11:28]** Not very, like, yeah, responsive or committal to anything. That's another key indicator that something's usually wrong. When we talk about, like, contracts, if they're I guess it goes back to the nonresponsive, but when they they get kind of, like, fidgety and weird about talking about contracts, What else? For a good account, I feel like you're having regular contact with them Your phone calls are productive. They are interested in knowing more, learning more, or they're content with what they have and

**You:** **[19:12:13]** Yeah.

**Other:** **[19:12:14]** and they're happy.

**You:** **[19:12:15]** Right. They're like,

**Other:** **[19:12:16]** And they express as much. Like, hey. We don't need any more, but

**You:** **[19:12:19]** We will yeah. You guys are great. We love you.

**Other:** **[19:12:20]** we feel great about what we have. Yeah.

**You:** **[19:12:23]** Li like, let us but this goes back to enjoying you while we're

**Other:** **[19:12:27]** Yeah.

**You:** **[19:12:27]** doing our other jobs.

**Other:** **[19:12:29]** Yep. Yep.

**You:** **[19:12:31]** Know. Some

**Other:** **[19:12:32]** So I felt like those are kind of the big the big things. I feel like most customers will be transparent but there are definitely warning signs. Like, what I mentioned.

**You:** **[19:12:42]** Okay. Cool. Alright. Here's what I got. I got now here is you have active WellCare users, active you WellCare users who've never logged in. Active WellCare users with Centene Corp,

**Other:** **[19:12:52]** And it's Okay.

**You:** **[19:12:55]** and now you have active select users.

**Other:** **[19:12:56]** Okay. Perfect. That is great.

**You:** **[19:12:59]** Alright. And then now I'm going to

**Other:** **[19:13:05]** And is this

**You:** **[19:13:08]** Auto

**Other:** **[19:13:09]** is this in DPI, like, when I log in?

**You:** **[19:13:11]** No. I'm gonna email this to you.

**Other:** **[19:13:12]** Okay. Gotcha.

**You:** **[19:13:17]** Every month.

**Other:** **[19:13:17]** K.

**You:** **[19:13:19]** And I'm gonna make sure I get filter values. I'm gonna attach the files as or the results the files to results. I'm gonna have them send only attachments. No charts. That's fine. And gonna send this email now.

**Other:** **[19:13:39]** K.

**You:** **[19:13:40]** Then you'll let me know. Okay.

**Other:** **[19:13:48]** Alright.

**You:** **[19:13:51]** Done. I think it think it might come from either support or Metabase.

**Other:** **[19:14:07]** K. I haven't gotten anything yet, but I'm guessing because there's files that attached, it'll take a sec.

**You:** **[19:14:13]** Alright. Here's something I've been working on.

**Other:** **[19:14:13]** K.

**You:** **[19:14:16]** Because I have also been struggling with this. This is a big chart and all of these dots are

**Other:** **[19:14:27]** K.

**You:** **[19:14:28]** DPI customers. And so here's, like, CalOptima, They're looking pretty good. The way that chart works is it takes left to right is monthly active users. So like, seventy five.

**Other:** **[19:14:50]** So to the right is larger. K.

**You:** **[19:14:53]** Yeah. And then yeah, the Calyto has got 46. And then you go into, like, Horizon Blue Cross Blue Shield's got one.

**Other:** **[19:15:01]** Okay.

**You:** **[19:15:02]** And then top section are people with upsell. Account or upsell opportunities in Salesforce. Middle is renewals and just like I think, like regular business, new business. And then the bottom section are ones with churn. Or downgrade opportunities.

**Other:** **[19:15:24]** Okay.

**You:** **[19:15:26]** What is this one? Amended scope ARR. Yeah. I guess this is, like, down. Yeah. And then let's do which one? Okay. Care first. My old. My old crew. Let's look at one here. VNS is new. Regional Blue Shield is also new. Would something like this, like this your triple s This also shows the Jira tickets. So, like, the quarterly model refresh, so the data ops, like, the the monthly refreshes, and then if any of them are blocked, or whatever. It also shows STARZ data. I don't know. This one doesn't have STARS data for some reason, but is something like this helpful

**Other:** **[19:16:26]** And this would only be for analytics. Right?

**You:** **[19:16:29]** Well, if this is helpful for analytics, we can try to, like, continue to expand and then just have different views of, like, only Ashley's accounts or like, whatever. We'd have to figure out what the right metrics are to, like, put them in these different zones. Like,

**Other:** **[19:16:46]** Yes.

**You:** **[19:16:47]** analytics is nice because there's at least, like, monthly active users, and that's, like, a an easy to tell metric of like, hey, if you have 46 people logging in, that's a good sign. If you have

**Other:** **[19:16:59]** Yeah.

**You:** **[19:16:59]** zero or one, bad sign.

**Other:** **[19:17:03]** Okay. So what

**You:** **[19:17:09]** Well, we're gonna

**Other:** **[19:17:09]** if a Sam was

**You:** **[19:17:11]** the way that I'm thinking about it, you're probably not the best. Well, I think you're the best example because we wanna make people more like you. But, like, what I'm thinking is not everybody is actually meeting with their customers regularly.

**Other:** **[19:17:23]** Yeah.

**You:** **[19:17:24]** And then my goal is that they don't ever log in to this,

**Other:** **[19:17:25]** Yeah.

**You:** **[19:17:28]** The system detects like, here's a churn risk because, like, the the monthly

**Other:** **[19:17:31]** Yeah.

**You:** **[19:17:34]** active users have dropped. Like, get in contact with this person immediately and it either makes like a Jira card for them and then we can track the Jira board. Like, the Jira board of like, churn risk accounts or like upsell check ins then there's just a big board and then you guys actually check that Jira board and it just gets assigned to like I don't even know. Whoever is someone who's not checking in with their accounts regularly.

**Other:** **[19:17:59]** Can it be community instead of Jira? Because I know plan trying to get us completely out of Jira and

**You:** **[19:18:06]** All in

**Other:** **[19:18:06]** selfishly, I hate Jira.

**You:** **[19:18:07]** hey. That's fine. That's fine. I can't I'm not allowed to leave Jira,

**Other:** **[19:18:09]** So yeah. Right. Right.

**You:** **[19:18:13]** but I can I can save you, save other people?

**Other:** **[19:18:14]** But for a Sam, yeah.

**You:** **[19:18:17]** Is it a Salesforce? Is it a commute there are there, like, cases that are basically internal only? I guess I could ask Amir, though.

**Other:** **[19:18:21]** Yep. Yes. Yeah. There's internal only quesos

**You:** **[19:18:27]** Smooth.

**Other:** **[19:18:28]** There's just, like, a check mark box in community. So you can do internal, and then there's external facing ones. I think it would be helpful for two things. One, oh, one other question I have before I jump into that. How would it be getting updated? Like, is it automatic based on

**You:** **[19:18:45]** That's what yeah. It's pulling Salesforce data

**Other:** **[19:18:46]** okay.

**You:** **[19:18:48]** It's pulling the DPI data. It's pulling the data, like,

**Other:** **[19:18:51]** It's not like a Sam has to go in and update anything.

**You:** **[19:18:53]** no.

**Other:** **[19:18:54]** Okay.

**You:** **[19:18:54]** The whole point is, like, we're doing this for Sam's and wanna do this for salespeople and basically say, like,

**Other:** **[19:18:55]** So I think yeah.

**You:** **[19:18:59]** you guys are already using Salesforce. This is just something that says, here is automated upsell identified opportunities. Go qualify this lead. Like, go like, here's somebody who has caps. They should have Haas. They have low Haas score.

**Other:** **[19:19:09]** Yeah.

**You:** **[19:19:12]** Talk to them about it.

**Other:** **[19:19:13]** Okay.

**You:** **[19:19:14]** Immediately. And then, like,

**Other:** **[19:19:15]** Yeah. Okay.

**You:** **[19:19:16]** they don't have to log in to that, but, like, it's helpful if you do.

**Other:** **[19:19:16]** Right. So one thing I think would be really helpful is we as Sam's, constantly get asked questions about customers like, are they at risk for churn? Me your top three customers that are at risk, blah blah blah blah blah. It's like, go into Salesforce. But the problem is in Salesforce, like, they have to go into each account individually. Look at the opportunities, see, like, what the notes are in there. So it's very difficult for a leader to do that, so it's just easier to ask

**You:** **[19:19:47]** Right.

**Other:** **[19:19:49]** a Sam, but it's exhausting from a Sam perspective when

**You:** **[19:19:50]** Right.

**Other:** **[19:19:52]** all I'm doing every week is giving you those notes

**You:** **[19:19:54]** One what's the how do you figure out if like, how do you look at an account and their opportunities?

**Other:** **[19:19:56]** and you're

**You:** **[19:20:01]** Like, let's pick one. Here. Eleventh. No.

**Other:** **[19:20:05]** want me to share my screen?

**You:** **[19:20:06]** Here. Yeah. You share your screen.

**Other:** **[19:20:10]** Let me share. Like, I'll show you. I mean, every here's a good one. So Centene corporate, here's the account. You go to opportunities. And then in here, like, there's a shit ton of opportunities. Right? Like, a leader can't go through these one by one to see what they say. So these two, like, I happen to enter in a churn risk because I do think there's a high probability they will churn.

**You:** **[19:20:34]** Yeah. Yep.

**Other:** **[19:20:37]** But, like, this is the renewal, and I have in the oh, sorry. Wrong renewal. Where in the hell is oh, right here. Here's the renewal. And I have in the notes here, like, at risk, met with

**You:** **[19:20:53]** Yeah. Yeah. Yeah. Yeah.

**Other:** **[19:20:54]** Centene, blah blah blah blah blah blah blah. So there's that. And then on top of that, I have the churn risk opportunity. So there's two places

**You:** **[19:21:03]** Right.

**Other:** **[19:21:05]** that this says this exact same thing. But I wanted to call it out. Like, hey. There is a churn risk for this lung. You also and I go and update these every single Monday. I update every single opportunity that I have

**You:** **[19:21:17]** Right.

**Other:** **[19:21:19]** with what's the latest and greatest update so that leadership has it,

**You:** **[19:21:22]** And then they feel and then everyone still ask you.

**Other:** **[19:21:23]** Yes. And then everyone still asks.

**You:** **[19:21:24]** And then yeah.

**Other:** **[19:21:27]** Like, today, I got a question today. Hey. Give me this. And I'm like, I I literally do this every single Monday. So it it's it's hard, but I get it. From a leader perspective, it's like, she's managing

**You:** **[19:21:39]** Right.

**Other:** **[19:21:39]** five of me, and we all have

**You:** **[19:21:41]** Right.

**Other:** **[19:21:42]** 12, 15 accounts. So she doesn't know. Right? So I get why she asks, but just frustrating from a Sam. And then another thing we do is, like, risk score history. So you can enter in risk scores

**You:** **[19:21:52]** Yeah.

**Other:** **[19:21:54]** on, like, where that's at. So that's another place

**You:** **[19:21:57]** Yeah. Yeah.

**Other:** **[19:21:58]** too that it could maybe pull information for your report. So I think from a leadership perspective, your thing could be very helpful. From a Sam, there's

**You:** **[19:22:05]** Right. Yeah. Yeah.

**Other:** **[19:22:07]** aspects of it that would be helpful. And then for sure from sales, it would be good.

**You:** **[19:22:10]** Okay. Good. Okay. Sweet. Thank you. Has been super helpful. Okay.

**Other:** **[19:22:16]** Yeah. Yeah.

**You:** **[19:22:18]** I will, catch up with you later.

**Other:** **[19:22:19]** Okay. K. Sounds good. Thanks.

**You:** **[19:22:22]** You get the email? Did it actually work?

**Other:** **[19:22:23]** Let me look really quick. Yeah. I did get it.

**You:** **[19:22:27]** Alright. Check it later.

**Other:** **[19:22:28]** Okay. Sounds good.

**You:** **[19:22:29]** Alright. Later.

**Other:** **[19:22:31]** K. Bye.

**You:** **[19:22:32]** Bye.
