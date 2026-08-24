let familyData = JSON.parse(localStorage.getItem("familyTree")) || [];

let nextId = 1;
if (familyData.length > 0) {
    nextId = Math.max(...familyData.map(member => member.id || 0)) + 1;
}

const form = document.getElementById("member-form");
const relationSelect = document.getElementById("relation");
const genderSelect = document.getElementById("gender");
const relatedSelect = document.getElementById("related-id");
const treeContainer = document.getElementById("tree-container");

// ===============================
// SAVE DATA
// ===============================
function saveData() {
    localStorage.setItem("familyTree", JSON.stringify(familyData));
}

// ===============================
// AUTO-SELECT GENDER ON RELATION CHANGE
// ===============================
if (relationSelect && genderSelect) {
    relationSelect.addEventListener("change", function () {
        const rel = relationSelect.value.toLowerCase();
        if (rel === "husband" || rel === "son" || rel === "father" || rel === "brother" || rel === "son-in-law" || rel === "son in law") {
            genderSelect.value = "Male";
        } else if (rel === "wife" || rel === "daughter" || rel === "mother" || rel === "sister" || rel === "daughter-in-law" || rel === "daughter in law") {
            genderSelect.value = "Female";
        }
    });
}

// ===============================
// UPDATE RELATED PERSON DROPDOWN
// ===============================
function updateRelatedSelect() {
    if (!relatedSelect) return;

    relatedSelect.innerHTML = `
        <option value="">-- Select Related Person --</option>
    `;

    familyData.forEach(member => {
        const option = document.createElement("option");
        option.value = member.id;
        option.textContent = `${member.name} (${member.relation || "Member"})`;
        relatedSelect.appendChild(option);
    });
}

// ===============================
// HELPER: IS SPOUSE RELATION
// ===============================
function isSpouseRelation(relation) {
    if (!relation) return false;
    const r = relation.toLowerCase().trim();
    return (
        r === "wife" ||
        r === "husband" ||
        r === "spouse" ||
        r === "son-in-law" ||
        r === "son in law" ||
        r === "daughter-in-law" ||
        r === "daughter in law"
    );
}

// ===============================
// FIND SPOUSE FOR A PERSON
// ===============================
function findSpouse(person) {
    if (!person) return null;

    // 1. Check direct relation where someone chose this person as related with a spouse relation
    let spouse = familyData.find(member =>
        member.id !== person.id &&
        member.relatedId === person.id &&
        isSpouseRelation(member.relation)
    );
    if (spouse) return spouse;

    // 2. Check inverse relation (this person was marked as spouse of member)
    if (isSpouseRelation(person.relation) && person.relatedId) {
        spouse = familyData.find(member => member.id === person.relatedId);
        if (spouse) return spouse;
    }

    // 3. Check if this person is a Daughter and someone was added as Son-in-law to her parent
    if (person.gender === "Female" || person.relation?.toLowerCase() === "daughter") {
        spouse = familyData.find(member => {
            const rel = member.relation?.toLowerCase().trim();
            return (
                (rel === "son-in-law" || rel === "son in law") &&
                (member.relatedId === person.id || (person.relatedId && member.relatedId === person.relatedId))
            );
        });
        if (spouse && spouse.id !== person.id) return spouse;
    }

    // 4. Check if this person is a Son and someone was added as Daughter-in-law to his parent
    if (person.gender === "Male" || person.relation?.toLowerCase() === "son") {
        spouse = familyData.find(member => {
            const rel = member.relation?.toLowerCase().trim();
            return (
                (rel === "daughter-in-law" || rel === "daughter in law") &&
                (member.relatedId === person.id || (person.relatedId && member.relatedId === person.relatedId))
            );
        });
        if (spouse && spouse.id !== person.id) return spouse;
    }

    return null;
}

// ===============================
// FIND CHILDREN FOR A COUPLE
// ===============================
function findChildren(person, spouse, renderedSet) {
    const parentIds = [person.id];
    if (spouse) {
        parentIds.push(spouse.id);
    }

    return familyData.filter(member => {
        // Must not already be rendered (e.g. primary or spouse)
        if (renderedSet && renderedSet.has(member.id)) return false;

        // Skip if member is spouse of either parent
        if (member.id === person.id || (spouse && member.id === spouse.id)) return false;

        // Skip if member is a spouse relation pointing to one of the parents (they are spouses, not children)
        if (parentIds.includes(member.relatedId) && isSpouseRelation(member.relation)) {
            return false;
        }

        // Include if relatedId matches person or spouse
        if (parentIds.includes(member.relatedId)) {
            return true;
        }

        return false;
    });
}

// ===============================
// ADD MEMBER
// ===============================
if (form) {
    form.addEventListener("submit", function (event) {
        event.preventDefault();

        const name = document.getElementById("name").value.trim();
        const gender = document.getElementById("gender").value;
        const relation = document.getElementById("relation").value;
        const dob = document.getElementById("dob").value.trim();
        let relatedId = relatedSelect.value === "" ? null : Number(relatedSelect.value);

        if (name === "") {
            alert("Please enter a name.");
            return;
        }

        // Smart link handling:
        if (relatedId !== null) {
            const relatedPerson = familyData.find(m => m.id === relatedId);

            if (relatedPerson) {
                const relLower = relation.toLowerCase().trim();

                // If adding Son-in-law and the selected person is a parent with a daughter, auto-link to daughter
                if (relLower === "son-in-law" || relLower === "son in law") {
                    if (relatedPerson.relation === "Daughter" || relatedPerson.gender === "Female") {
                        relatedId = relatedPerson.id;
                    } else {
                        // Look for a daughter belonging to the selected parent
                        const daughter = familyData.find(m =>
                            m.relatedId === relatedPerson.id &&
                            (m.relation?.toLowerCase() === "daughter" || m.gender === "Female")
                        );
                        if (daughter) {
                            relatedId = daughter.id;
                        }
                    }
                }

                // If adding Daughter-in-law and the selected person is a parent with a son, auto-link to son
                if (relLower === "daughter-in-law" || relLower === "daughter in law") {
                    if (relatedPerson.relation === "Son" || relatedPerson.gender === "Male") {
                        relatedId = relatedPerson.id;
                    } else {
                        const son = familyData.find(m =>
                            m.relatedId === relatedPerson.id &&
                            (m.relation?.toLowerCase() === "son" || m.gender === "Male")
                        );
                        if (son) {
                            relatedId = son.id;
                        }
                    }
                }

                // If adding Brother or Sister, connect to the same parent
                if (relLower === "brother" || relLower === "sister") {
                    if (relatedPerson.relatedId !== null) {
                        relatedId = relatedPerson.relatedId;
                    }
                }
            }
        }

        const member = {
            id: nextId,
            name: name,
            gender: gender,
            relation: relation,
            dob: dob,
            relatedId: relatedId
        };

        // If adding a Father or Mother to an existing root person with no parent:
        if ((relation === "Father" || relation === "Mother") && relatedId !== null) {
            const childMember = familyData.find(m => m.id === relatedId);
            if (childMember && childMember.relatedId === null) {
                childMember.relatedId = member.id;
                member.relatedId = null;
            }
        }

        nextId++;
        familyData.push(member);

        saveData();
        updateRelatedSelect();
        renderTree();
        form.reset();
    });
}

// ===============================
// CREATE PERSON CARD
// ===============================
function createCard(member) {
    const card = document.createElement("div");
    card.className = "member-card";

    // Add gender specific accent class
    if (member.gender) {
        card.classList.add(member.gender.toLowerCase());
    }

    card.innerHTML = `
        <button
            class="delete-btn"
            title="Delete member"
            onclick="deleteMember(${member.id})">
            &times;
        </button>
        <div class="member-name">${escapeHtml(member.name)}</div>
        <div class="member-relation">${escapeHtml(member.relation || "Member")}</div>
        ${member.dob ? `<div class="member-details">${escapeHtml(member.dob)}</div>` : ""}
    `;

    return card;
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ===============================
// CREATE FAMILY BRANCH (RECURSIVE)
// ===============================
function createFamily(primaryPerson, renderedSet = new Set()) {
    if (renderedSet.has(primaryPerson.id)) {
        return null;
    }

    renderedSet.add(primaryPerson.id);

    const family = document.createElement("div");
    family.className = "family-branch";

    // Couple container (Primary + Spouse)
    const couple = document.createElement("div");
    couple.className = "couple";

    const spouse = findSpouse(primaryPerson);
    if (spouse) {
        renderedSet.add(spouse.id);
    }

    let leftPerson = primaryPerson;
    let rightPerson = spouse;

    couple.appendChild(createCard(leftPerson));

    if (rightPerson) {
        const line = document.createElement("div");
        line.className = "spouse-line";
        couple.appendChild(line);
        couple.appendChild(createCard(rightPerson));
    }

    family.appendChild(couple);

    // Find Children of this couple
    const children = findChildren(primaryPerson, spouse, renderedSet);

    if (children.length > 0) {
        const childrenContainer = document.createElement("div");
        childrenContainer.className = "children";

        children.forEach(child => {
            const childBranch = createFamily(child, renderedSet);
            if (childBranch) {
                childrenContainer.appendChild(childBranch);
            }
        });

        if (childrenContainer.children.length > 0) {
            family.appendChild(childrenContainer);
        }
    }

    return family;
}

// ===============================
// GET ROOT MEMBERS OF THE TREE
// ===============================
function getRootMembers() {
    if (familyData.length === 0) return [];

    // Find members without parents in familyData
    const potentialRoots = familyData.filter(member => {
        if (member.relatedId === null || member.relatedId === undefined) return true;
        // Or if their related person does not exist in familyData
        return !familyData.some(m => m.id === member.relatedId);
    });

    const roots = [];
    const spouseSet = new Set();

    potentialRoots.forEach(member => {
        if (spouseSet.has(member.id)) return;

        const spouse = findSpouse(member);
        if (spouse) {
            spouseSet.add(spouse.id);
        }
        roots.push(member);
    });

    if (roots.length === 0 && familyData.length > 0) {
        roots.push(familyData[0]);
    }

    return roots;
}

// ===============================
// RENDER TREE
// ===============================
function renderTree() {
    if (!treeContainer) return;
    treeContainer.innerHTML = "";

    if (familyData.length === 0) {
        treeContainer.innerHTML = "<p>No family members added yet.</p>";
        return;
    }

    const roots = getRootMembers();
    const renderedSet = new Set();

    roots.forEach(rootMember => {
        const branch = createFamily(rootMember, renderedSet);
        if (branch) {
            treeContainer.appendChild(branch);
        }
    });

    // Render any orphan/remaining members not yet rendered
    familyData.forEach(member => {
        if (!renderedSet.has(member.id)) {
            const branch = createFamily(member, renderedSet);
            if (branch) {
                treeContainer.appendChild(branch);
            }
        }
    });
}

// ===============================
// DELETE MEMBER
// ===============================
window.deleteMember = function (id) {
    if (!confirm("Delete this member?")) {
        return;
    }

    // Remove member
    familyData = familyData.filter(member => member.id !== id);

    // Reset relatedId for members pointing to the deleted member
    familyData.forEach(member => {
        if (member.relatedId === id) {
            member.relatedId = null;
        }
    });

    saveData();
    updateRelatedSelect();
    renderTree();
};

// ===============================
// CLEAR TREE
// ===============================
const clearBtn = document.getElementById("clear-tree");
if (clearBtn) {
    clearBtn.addEventListener("click", function () {
        if (!confirm("Are you sure you want to clear the entire family tree?")) {
            return;
        }

        familyData = [];
        nextId = 1;
        saveData();
        updateRelatedSelect();
        renderTree();
    });
}

// ===============================
// INITIALIZE
// ===============================
updateRelatedSelect();
renderTree();
