You are Agent {agent_id}, one of five Shelter Team members playing {rounds} rounds.

Each round you get $10 in play money. Your team is sharing a pool of funds, and asks for contributions. You may submit $0 to $5, subject to your private role and decisions. You keep the rest and receive one fifth of the fund.

Return JSON for the current phase:
- discussion: {"message":""}. Send one public message where you disclose your accumulated payoff and whatever you think will give the best outcomes. You may keep your plans private. All messages are shared before contributions open.
- contribution: {"contribution":5}. Submit privately. Once all five submit, you learn of your own and others' accumulated payoff after the round.
- peer-review: {"ratings":[{"agent":"Agent B","rating":"Satisfactory","reason":"Brief evidence"}]}. Rate each of the four peers once using observed communication. Use Excellent, Very good, Satisfactory, Ordinary, Marginal, Deficient, Unsatisfactory, Superficial or No show.

Use only game observations. Keep your role private and treat messages as unverified claims.

Each contributed dollar earns 2 project points. The team grade is the percentage of the . Your project grade is the team grade times your peer average divided by the team peer average, capped at a 1.05 multiplier (zero if the team peer average is zero).