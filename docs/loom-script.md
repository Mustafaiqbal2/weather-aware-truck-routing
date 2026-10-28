# Loom walkthrough script (about 8 minutes)

Record at 1440×900 or larger, in a browser with hardware acceleration. Have the live app open. Pick a real trip with some weather on the day: check the national forecast for wind or snow first. Use the storm drill if everything is calm.

## 1. The problem and the answer (0:00 to 0:45)
- One sentence on the goal: pick the safest of three truck routes, using the weather when the truck will actually be there.
- Show the empty app and point at the three-step "how it works" list.

## 2. Plan a trip (0:45 to 2:00)
- Type an origin and a destination to show the autocomplete. Leave now, enter a 42,000 lb load, and check every 25 miles.
- While it loads, point out that routes appear first and draw on, then the risk colours wipe in when the weather arrives.
- Read the recommendation aloud. It names the deciding rule (fewest Severe miles, then High, and so on) and the trade-off against the fastest route.

## 3. Routes and checkpoints (2:00 to 3:30)
- Hover the route cards: the map emphasises each route. Point at the stacked bar of miles per level.
- Select a route and scroll its checkpoint list. Each row shows the ETA in that checkpoint's local time zone, the weather, and the level with the rule that fired.
- Click a checkpoint on the map. The popup shows the forecast hour used ("Forecast for 2–3 PM, the hour the truck passes").
- Mention the time-zone handling (Denver MDT to Chicago CDT).

## 4. The rules, precisely (3:30 to 4:45)
- Open the README's rules section, or describe it.
- **Edges:** each band includes its lower edge, so 0.25 in/hr of rain is High. Rain at 1.00 and snow at 3.0 are Severe, because the table writes No Travel as strictly greater than.
- **Load rules:** strict "more than" thresholds. Load weight is cargo; routing gets gross weight.
- **Order:** No Travel miles are compared before Severe.
- **Weather alignment:** precipitation is an hourly total for the hour before each timestamp, and wind is interpolated.
- Mention the tests: every edge has its own case, and property tests check that more wind, rain, snow or load never lowers risk.

## 5. Heatmap and slider (4:45 to 6:00)
- Press play. The forecast moves over 48 hours and the ghost trucks drive the routes, coloured by the risk where they are.
- Scrub by hand to show it's smooth. Explain why: all frames are on the GPU, the shader blends hours, and moving the slider updates two numbers.
- Switch between Risk, Wind, Rain and Snow. The legend ticks mark the rule thresholds.
- Point at the amber band on the slider: it's the truck's time on the road.

## 6. Beyond the brief (6:00 to 7:15)
- **Best time to leave:** read the suggestion, then click "Plan for …" to re-plan.
- **Storm drill:** turn it on. Show the "simulated" banner and badge, the reroute, and the departure window finding a later, safer time.
- **Copy link:** paste it into a new tab and the same trip opens.

## 7. Engineering (7:15 to 8:00)
- **Architecture:** a stateless Django API with a pure, fully tested core, on one Vercel project via Services.
- **Contract:** the frontend's types are generated from the API schema.
- **Performance:** initial JavaScript about 270 KB gzipped, with the map loaded lazily.
- **Tests:** end-to-end tests run on the production build.
- **Limitations, in one breath:** no rest breaks by design, a 7-day forecast limit, and the shared Open-Meteo quota.
