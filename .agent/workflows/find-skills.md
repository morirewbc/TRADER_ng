---
description: Discover and install agent skills using the Skills CLI
---
1. Clarify the user's task or domain to identify the need for an existing skill.
2. Run `npx skills find [query]` to search for relevant skills.
3. Present the relevant options to the user along with the install command.
4. If approved, install the skill globally using `npx skills add <owner/repo@skill> -g -y`.
5. If no skill is found, offer to perform the task directly and suggest `npx skills init` if they want to create their own.
