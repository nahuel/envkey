import React, { useState, useEffect, useLayoutEffect, useMemo } from "react";
import { Component } from "@ui_types";
import { HomeContainer } from "../home/home_container";
import * as styles from "@styles";
import { ExternalLink } from "../shared";
import { Client, Api, Billing } from "@core/types";
import { SmallLoader, SvgImage } from "@images";
import * as R from "ramda";
import * as g from "@core/lib/graph";
import { formatUsd } from "@core/lib/utils/currency";
import { fetchState } from "@core/lib/core_proc";
import * as ui from "@ui";
import { capitalize } from "@core/lib/utils/string";

let fetchStateInterval: ReturnType<typeof setInterval> | undefined;

export const V1Upgrade: Component = (props) => {
  const [accountId, setAccountId] = useState<string>();
  const [validAccountIds, setValidAccountIds] = useState<string[]>();

  const [ssoEnabled, setSSOEnabled] = useState(false);
  const [importLocalKeys, setImportLocalKeys] = useState(true);

  const [appIds, setAppIds] = useState<string[]>();
  const [selectAllApps, setSelectAllApps] = useState(true);

  const [startedUpgrade, setStartedUpgrade] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [startedImport, setStartedImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [upgradeComplete, setUpgradeComplete] = useState(false);
  const [awaitingV1Complete, setAwaitingV1Complete] = useState(false);

  const [chosenProductId, setChosenProductId] = useState<string | undefined>();

  const [billingInterval, setBillingInterval] =
    useState<Api.V1Upgrade.Upgrade["billingInterval"]>("month");

  const [deviceName, setDeviceName] = useState(
    props.core.defaultDeviceName ?? ""
  );

  useLayoutEffect(() => {
    if (!props.core.v1UpgradeLoaded && !startedUpgrade) {
      props.history.push("/home");
    }
  }, [props.core.v1UpgradeLoaded]);

  useLayoutEffect(() => {
    props.setUiState({ accountId: undefined, loadedAccountId: undefined });
    props.dispatch({
      type: Client.ActionType.RESET_ORG_IMPORT,
    });
  }, []);

  useEffect(
    () => () => {
      if (fetchStateInterval) {
        clearInterval(fetchStateInterval);
      }
      props.dispatch({
        type: Client.ActionType.RESET_V1_UPGRADE,
        payload: { cancelUpgrade: !upgradeComplete },
      });
    },
    []
  );

  useEffect(() => {
    (async () => {
      if (
        startedUpgrade &&
        upgrading &&
        importing &&
        !(props.core.v1UpgradeError || props.core.importOrgError) &&
        props.core.v1UpgradeStatus == "finished"
      ) {
        setUpgrading(false);
        setImporting(false);
        setAwaitingV1Complete(true);

        props.setUiState({ importStatus: "Waiting for v1 to finish upgrade" });
      } else if (props.core.isImportingOrg && !importing) {
        setImporting(true);
        setStartedImport(true);

        if (fetchStateInterval) {
          clearInterval(fetchStateInterval);
        }
        fetchStateInterval = setInterval(() => {
          console.log("refreshing core state fetch import error");
          props.refreshCoreState();
        }, 1000);
      }
    })();
  }, [props.core.isImportingOrg, props.core.v1UpgradeStatus]);

  useEffect(() => {
    (async () => {
      if (
        awaitingV1Complete &&
        !props.core.v1UpgradeLoaded &&
        fetchStateInterval
      ) {
        clearInterval(fetchStateInterval);
        fetchStateInterval = undefined;
        setAwaitingV1Complete(false);
        setUpgradeComplete(true);
        props.setUiState({ importStatus: undefined });
      }
    })();
  }, [props.core.v1UpgradeLoaded, awaitingV1Complete]);

  useEffect(() => {
    if (
      props.core.v1UpgradeError ||
      props.core.importOrgError ||
      props.core.loadCloudProductsError
    ) {
      setUpgrading(false);
      setImporting(false);
      setCreatingOrg(false);
      setUpgradeComplete(true);

      if (fetchStateInterval) {
        clearInterval(fetchStateInterval);
        fetchStateInterval = undefined;
      }
    }
  }, [
    props.core.v1UpgradeError,
    props.core.importOrgError,
    props.core.loadCloudProductsError,
  ]);

  useEffect(() => {
    if (creatingOrg && (!props.core.isRegistering || props.ui.importStatus)) {
      setCreatingOrg(false);
      if (props.core.registrationError) {
        setUpgrading(false);
        setUpgradeComplete(true);
      }
    } else if (props.core.isRegistering && !creatingOrg) {
      setCreatingOrg(true);
    }
  }, [props.core.isRegistering, props.ui.importStatus]);

  useEffect(() => {
    props.dispatch({
      type: Api.ActionType.CLOUD_BILLING_LOAD_PRODUCTS,
      payload: {},
    });

    (async () => {
      const valid: string[] = [];
      for (const account of Object.values(props.core.orgUserAccounts)) {
        if (!account || !account.token) {
          continue;
        }

        let accountState = await fetchState(account.userId);

        if (!(accountState.graph && accountState.graph[account.userId])) {
          const res = await props.dispatch(
            {
              type: Client.ActionType.GET_SESSION,
              payload: {},
            },
            undefined,
            true,
            account.userId
          );
          if (res.success) {
            accountState = res.state;
          } else {
            console.error("failed to get session", {
              userId: account.userId,
              orgId: account.orgId,
              res,
            });
            continue;
          }
        }

        if (
          g.authz.hasOrgPermission(
            accountState.graph,
            account.userId,
            "org_archive_import_export"
          )
        ) {
          valid.push(account.userId);
        }
      }
      setValidAccountIds(valid);
    })();
  }, []);

  useLayoutEffect(() => {
    if (accountId) {
      props.dispatch(
        {
          type: Client.ActionType.RESET_ORG_IMPORT,
        },
        undefined,
        undefined,
        accountId
      );
      props.setUiState({ accountId, loadedAccountId: undefined });
    } else {
      props.dispatch({
        type: Client.ActionType.RESET_ORG_IMPORT,
      });
      props.setUiState({ accountId: undefined, loadedAccountId: undefined });
    }
  }, [accountId]);

  useEffect(() => {
    (async () => {
      if (
        accountId &&
        props.ui.loadedAccountId &&
        props.ui.loadedAccountId == accountId &&
        props.core.graph &&
        props.core.graph[accountId]
      ) {
        await props.dispatch({
          type: Client.ActionType.RESET_ORG_IMPORT,
        });
        await props.dispatch({
          type: Client.ActionType.DECRYPT_ORG_ARCHIVE,
          payload: { ...props.core.v1UpgradeLoaded!, isV1Upgrade: true },
        });
      } else if (!accountId && props.core.filteredOrgArchive) {
        await props.dispatch({
          type: Client.ActionType.RESET_ORG_IMPORT,
        });
      }
    })();
  }, [
    Boolean(
      accountId &&
        props.ui.loadedAccountId &&
        props.ui.loadedAccountId == accountId &&
        props.core.graph &&
        props.core.graph[accountId]
    ),
  ]);

  const {
    license: selectedAccountLicense,
    currentPrice: selectedAccountCurrentPrice,
    numActiveUsers: selectedAccountNumActiveUsers,
    subscription: selectedAccountSubscription,
    org: selectedOrg,
  } = useMemo(() => {
    if (!accountId || !props.core.graphUpdatedAt) {
      return {};
    }

    const { license, org, subscription } = g.graphTypes(props.core.graph);

    const numActiveUsers = org.activeUserOrInviteCount;

    return {
      license,
      currentPrice: subscription
        ? (props.core.graph[subscription.priceId] as Billing.Price)
        : undefined,
      numActiveUsers,
      subscription,
      org,
    };
  }, [props.core.graphUpdatedAt, accountId]);

  const dispatchUpgrade = () => {
    props.dispatch({
      type: Client.ActionType.START_V1_UPGRADE,
      payload: {
        accountId,
        deviceName: accountId ? undefined : deviceName,
        importOrgUsers: !ssoEnabled,
        importLocalKeys,
        importServers: true,
        importEnvParentIds: appIds,
        ssoEnabled,
        billingInterval: accountId ? undefined : billingInterval,
        newProductId: accountId ? undefined : selectedProduct?.id,
        freeTier:
          chosenProductId == "free" || Boolean(accountId && freeTierEnabled),
      },
    });
    setUpgrading(true);
    setStartedUpgrade(true);
  };

  const numUsers =
    accountId && selectedOrg && props.core.filteredOrgArchive
      ? props.core.filteredOrgArchive.orgUsers.length +
        (selectedOrg.activeUserOrInviteCount ?? 0)
      : props.core.v1UpgradeLoaded?.numUsers ?? 0;
  const freeTierEnabled = numUsers <= 3 && !ssoEnabled;
  const defaultPlan = g.planForNumUsers(
    props.core.cloudProducts ?? [],
    numUsers,
    ssoEnabled
  );
  const validPlans = [defaultPlan!].filter(Boolean);

  if (defaultPlan && !ssoEnabled && !defaultPlan.product.ssoEnabled) {
    validPlans.push(
      g.planForNumUsers(props.core.cloudProducts ?? [], numUsers, true)!
    );
  }

  const selectedProduct =
    chosenProductId == "free" && !accountId
      ? undefined
      : props.core.cloudProducts?.find((p) =>
          chosenProductId
            ? chosenProductId == p.id
            : defaultPlan?.product.id == p.id
        );
  const selectedPrice = selectedProduct
    ? props.core.cloudPrices?.find(
        (p) =>
          p.productId == selectedProduct.id && p.interval == billingInterval
      )
    : undefined;

  const selectedAccountLicenseExceeded =
    accountId &&
    selectedAccountLicense &&
    ((selectedAccountLicense.maxUsers &&
      selectedAccountLicense.maxUsers != -1 &&
      numUsers > selectedAccountLicense.maxUsers) ||
      (selectedAccountLicense.isCloudBasics && ssoEnabled));

  const resetUpgradeButton = (label = "Cancel Upgrade") => (
    <button
      className="secondary"
      onClick={async (e) => {
        e.preventDefault();
        await props.dispatch({
          type: Client.ActionType.RESET_V1_UPGRADE,
          payload: { cancelUpgrade: true },
        });
        props.history.push("/home");
      }}
    >
      {label}
    </button>
  );

  const availablePlansStart = [
    "With ",
    <strong>
      {numUsers} active user
      {numUsers > 1 ? "s" : ""}
    </strong>,
    ssoEnabled ? " and SSO enabled," : <strong>,</strong>,
  ];

  const availablePlansDefaultOnly = defaultPlan ? (
    <p>
      {availablePlansStart} you'll be subscribed to the{" "}
      <strong>{defaultPlan.product.name.replace("v2 ", "")} Plan.</strong>
    </p>
  ) : (
    ""
  );

  const availablePlansCopy = () => {
    const start = availablePlansStart;

    const end = [
      <p>
        {[
          `As a v1 user, you'll get a `,
          <strong>lifetime 10% discount.</strong>,
          " ",
        ]}
      </p>,

      validPlans.length > 1 || freeTierEnabled ? (
        <p>Which plan would you like to subscribe to?</p>
      ) : (
        ""
      ),
    ];

    if (validPlans.length > 1) {
      if (freeTierEnabled) {
        return [
          <p>
            {start} you have the option of subscribing to our free{" "}
            <strong>Community Cloud Plan,</strong> our{" "}
            <strong>Cloud Basics Plan,</strong> (with priority support and
            unlimited audit logs) or our <strong>Cloud Pro Plan</strong> (with
            SSO and teams).
          </p>,
          end,
        ];
      } else {
        return [
          <p>
            {start} you have the option of subscribing to our{" "}
            <strong>Cloud Basics Plan</strong> or our
            <strong>Cloud Pro Plan</strong> (with SSO and teams).
          </p>,
          end,
        ];
      }
    } else if (defaultPlan) {
      return [availablePlansDefaultOnly, end];
    }
  };

  let status: string;
  if (creatingOrg) {
    status = "Creating organization";
  } else if (props.core.isDecryptingOrgArchive) {
    status = "Loading v1 upgrade";
  } else if (props.ui.importStatus ?? props.core.importOrgStatus) {
    status = (props.ui.importStatus ?? props.core.importOrgStatus)!;
  } else if (importing) {
    status = "Starting import";
  } else if (startedUpgrade) {
    status = "Finishing upgrade";
  } else {
    status = "Preparing upgrade";
  }
  const upgradeStatus = (
    <form>
      <div className="field">
        <SmallLoader />
        <p className="org-import-status">{status}...</p>
      </div>
    </form>
  );

  const err =
    props.core.loadCloudProductsError ??
    props.core.v1UpgradeError ??
    props.core.importOrgError;
  const errorMessage =
    !err || err.error === true || !err.error?.message
      ? undefined
      : capitalize(err.error.message.replace("v1 upgrade - ", "")) + ".";
  const upgradeError = (
    <form>
      <p>
        There was a problem finishing the upgrade. Please contact{" "}
        <strong>support@envkey.com</strong> for help.
      </p>
      {errorMessage ? <p className="error">{errorMessage}</p> : ""}
      <div className="buttons">{resetUpgradeButton("Back To Home")}</div>
    </form>
  );

  const upgradeFinished = (
    <form>
      <div>
        <p className="org-import-status">Your upgrade has finished!</p>
      </div>
      <div className="buttons">
        <button
          className="primary"
          onClick={(e) => {
            e.preventDefault();

            let orgId: string;
            let userId: string;

            if (accountId) {
              userId = accountId;
              orgId = props.core.orgUserAccounts[accountId]!.orgId;
            } else {
              ({ userId, orgId } = R.last(
                R.sortBy(
                  R.prop("lastAuthAt"),
                  Object.values(
                    props.core.orgUserAccounts
                  ) as Client.ClientUserAuth[]
                )
              )!);
            }

            props.setUiState({
              accountId: userId,
              loadedAccountId: userId,
              lastLoadedAccountId: userId,
            });

            props.history.push(`/org/${orgId}`);
          }}
        >
          Go To Your V2 Org →
        </button>
      </div>
    </form>
  );

  const ssoSection = (
    <div>
      <div className="field no-margin">
        <label>SSO</label>
      </div>
      <p>
        Imported v1 users will use <strong>email authentication.</strong> If you
        want to use <strong>SSO</strong> instead, check the box below and
        re-invite users after the upgrade finishes and you've configured SSO.
      </p>
      <div
        className={"field checkbox" + (ssoEnabled ? " selected" : "")}
        onClick={() => setSSOEnabled(!ssoEnabled)}
      >
        <label>Use SSO</label>
        <input type="checkbox" checked={ssoEnabled} />
      </div>
    </div>
  );

  const newOrExistingOrgSection =
    validAccountIds && validAccountIds.length > 0 ? (
      <div>
        <div className="field no-margin">
          <label>New Or Existing Org</label>
        </div>

        <p>
          You can either upgrade your v1 org into a new v2 org, or you can
          upgrade it into an existing v2 org.
        </p>

        <div className="field">
          <div className="select">
            <select
              value={accountId ?? "new"}
              onChange={(e) => {
                const accountId =
                  e.target.value == "new" ? undefined : e.target.value;
                setAccountId(accountId);
              }}
            >
              <option value="new">Upgrade into a new org</option>
              {validAccountIds.map((accountId) => {
                const account = props.core.orgUserAccounts[accountId]!;
                return (
                  <option value={accountId}>
                    Upgrade into {account.orgName}
                  </option>
                );
              })}
            </select>
            <SvgImage type="down-caret" />
          </div>
        </div>
      </div>
    ) : (
      ""
    );

  const localKeysSection = (
    <div>
      <div className="field no-margin">
        <label>Local Development ENVKEYs</label>
      </div>
      <p>
        In EnvKey v2, managing local development ENVKEYs manually is no longer
        necessary.
        <br />
        <br /> <strong>If you don't import</strong> your v1 local ENVKEYs,
        you'll need to run <code>envkey init</code> in the root directory of
        each of your apps, and then commit the resulting{" "}
        <strong>.envkey</strong> file to version control. All users with access
        to an app will then be able to load the local development environment
        without generating a local key. After upgrading, each user should also{" "}
        <strong>clear out any v1 local ENVKEYs set in .env files.</strong>
        <br />
        <br />
        <strong>If you do import</strong> your v1 local ENVKEYs, all your
        existing local ENVKEYs will continue working in v2 without requiring you
        to run <code>envkey init</code> in your projects. You can also import
        your local ENVKEYs now, then move away from them gradually later.
      </p>
      <div
        className={"field checkbox" + (importLocalKeys ? " selected" : "")}
        onClick={() => setImportLocalKeys(!importLocalKeys)}
      >
        <label>Import V1 Local Keys</label>
        <input type="checkbox" checked={importLocalKeys} />
      </div>
    </div>
  );

  const billingSection = () => {
    if (props.core.v1UpgradeLoaded!.signedPresetBilling) {
      return "";
    }
    if (accountId && selectedOrg && selectedOrg.customLicense) {
      return "";
    }
    if (accountId && !selectedAccountLicenseExceeded) {
      return "";
    }
    if (accountId && (!selectedAccountLicense || !selectedOrg)) {
      return "";
    }

    const header = (
      <div>
        <div className="field no-margin">
          <label>Billing</label>
        </div>
        <p>
          <strong>
            <ExternalLink {...props} to={"https://www.envkey.com/pricing/"}>
              See pricing for v2 plans →
            </ExternalLink>
          </strong>{" "}
        </p>
      </div>
    );

    if (accountId && selectedAccountLicenseExceeded) {
      return (
        <div>
          {header}
          {availablePlansDefaultOnly}
          <p>Your v1 subscription will be canceled.</p>
        </div>
      );
    }

    return (
      <div>
        {header}
        {availablePlansCopy()}
        {freeTierEnabled || validPlans.length > 1
          ? [
              <div className="field">
                <div className="select">
                  <select
                    onChange={(e) => {
                      setChosenProductId(e.target.value as string);
                    }}
                    value={chosenProductId ?? defaultPlan?.product.id}
                  >
                    {validPlans
                      .map((plan) => (
                        <option key={plan.product.id} value={plan.product.id}>
                          {plan.product.name.replace("v2 ", "")}
                        </option>
                      ))
                      .concat(
                        freeTierEnabled
                          ? [
                              <option key="free" value="free">
                                Community Cloud
                              </option>,
                            ]
                          : []
                      )}
                  </select>
                  <SvgImage type="down-caret" />
                </div>
              </div>,
            ]
          : null}
        {chosenProductId == "free"
          ? ""
          : [
              <p>
                You can get an{" "}
                <strong>additional discount if you pay annually</strong> (about
                16% off). How would you like to pay?
              </p>,

              <div className="field">
                <div className="select">
                  <select
                    onChange={(e) => {
                      setBillingInterval(
                        e.target.value as typeof billingInterval
                      );
                    }}
                    value={billingInterval}
                  >
                    <option value="month">Pay Monthly</option>
                    <option value="year">Pay Annually</option>
                  </select>
                  <SvgImage type="down-caret" />
                </div>
              </div>,
            ]}
        {selectedProduct && selectedPrice ? (
          [
            <p>
              We'll use your v1 payment details. Your v1 subscription will be
              canceled.
            </p>,
            <div className="field no-margin">
              <label>Total Price</label>
            </div>,
            <p>
              {formatUsd(
                selectedPrice.amount * (freeTierEnabled ? 0.85 : 0.9)
              ) + (billingInterval == "year" ? " per year" : " per month")}
            </p>,
          ]
        ) : (
          <p>Your v1 subscription will be canceled.</p>
        )}
      </div>
    );
  };

  const deviceNameSection = (
    <div className="field">
      <label>Name Of This Device</label>
      <input
        type="text"
        placeholder="Enter a name..."
        value={deviceName ?? ""}
        required
        onChange={(e) => setDeviceName(e.target.value)}
      />
    </div>
  );

  const clientLibrariesSection = (
    <div>
      <div className="field no-margin">
        <label>Client Libraries</label>
      </div>
      <p>
        After your upgrade finishes, you'll also need to{" "}
        <strong>upgrade up any EnvKey client libraries</strong> to their latest{" "}
        <strong>2.x.x</strong> versions (this includes envkey-source in addition
        to any language-specific libraries).
        <br />
        <br />
        <strong>
          1.x.x libraries will continue working with your v1 ENVKEYs in the
          meantime,
        </strong>{" "}
        so you can do this gradually without worrying about downtime, but
        changes you make in v2 won't be picked up until you upgrade client
        libraries.
      </p>
    </div>
  );

  const finishActionSection = (
    <div>
      <div className="field no-margin">
        <label>That's everything</label>
      </div>
      <p>
        You're ready to finish the upgrade. Please reach out to{" "}
        <strong>support@envkey.com</strong> if you have any problems, questions,
        or feedback relating to the upgrade or any aspect of EnvKey v2.
      </p>
      <div className="buttons">
        {resetUpgradeButton()}
        <button
          className="primary"
          onClick={(e) => {
            e.preventDefault();
            dispatchUpgrade();
          }}
        >
          Finish Upgrade →
        </button>
      </div>
    </div>
  );

  const appSelectSection =
    props.core.filteredOrgArchive &&
    props.core.filteredOrgArchive.apps.length > 1 ? (
      <div>
        <div className="field">
          <label>Apps</label>
          <p>
            Do you want to move all the apps from your v1 org to your v2 org, or
            choose which to bring over?
          </p>
          <div className="select">
            <select
              value={selectAllApps ? "all" : "choose"}
              onChange={(e) => {
                const selectAll = e.target.value == "all";
                setSelectAllApps(selectAll);
                if (selectAll) {
                  setAppIds(undefined);
                }
              }}
            >
              <option value="all">Upgrade all apps</option>
              <option value="choose">Select which apps to upgrade</option>
            </select>
            <SvgImage type="down-caret" />
          </div>
        </div>
        {selectAllApps ? (
          ""
        ) : (
          <div className="field select-apps">
            <label>Select Apps</label>
            <ui.CheckboxMultiSelect
              winHeight={props.winHeight}
              noSubmitButton={true}
              emptyText={`No apps to upgrade`}
              items={props.core.filteredOrgArchive.apps.map((app) => {
                return {
                  label: <label>{app.name}</label>,
                  searchText: app.name,
                  id: app.id,
                };
              })}
              onChange={(ids) => setAppIds(ids)}
            />
          </div>
        )}
      </div>
    ) : (
      ""
    );

  if (!props.core.v1UpgradeLoaded && !startedUpgrade) {
    return (
      <HomeContainer anchor="center">
        <div className={styles.V1Upgrade}></div>
      </HomeContainer>
    );
  }

  if (
    accountId &&
    selectedAccountLicenseExceeded &&
    selectedOrg &&
    selectedOrg.customLicense
  ) {
    <HomeContainer anchor="center">
      <div className={styles.V1Upgrade}>
        <h3>
          <strong>Upgrade</strong> From V1
        </h3>

        <p>
          You're on a custom billing plan and your plan's user limit would be
          exceeded by the upgrade. Please contact{" "}
          <strong>sales@envkey.com</strong>
        </p>
      </div>
    </HomeContainer>;
  }

  return (
    <HomeContainer anchor="center">
      <div className={styles.V1Upgrade}>
        <h3>
          <strong>Upgrade</strong> From V1
        </h3>

        {upgrading ||
        awaitingV1Complete ||
        !props.core.cloudProducts ||
        !validAccountIds ? (
          upgradeStatus
        ) : upgradeComplete ||
          (startedUpgrade && !props.core.v1UpgradeLoaded) ? (
          props.core.v1UpgradeError ||
          props.core.importOrgError ||
          props.core.loadCloudProductsError ? (
            upgradeError
          ) : (
            upgradeFinished
          )
        ) : (
          <form>
            {newOrExistingOrgSection}
            {ssoSection}
            {accountId ? appSelectSection : ""}
            {localKeysSection}
            {billingSection()}
            {accountId ? "" : deviceNameSection}
            {clientLibrariesSection}
            {finishActionSection}
          </form>
        )}
      </div>
    </HomeContainer>
  );
};
